//! Activities tool - search transactions.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use wealthfolio_core::activities::{ActivityDetails, ActivitySearchResponse, Sort};

use crate::constants::{DEFAULT_PAGE_SIZE, MAX_ACTIVITIES_ROWS};
use crate::env::{AgentEnvironment, EntryExtras, EntryLookup};
use crate::scope::AgentScope;
use crate::tool::{AgentTool, AgentToolAccess, AgentToolError, AgentToolResult};

/// Arguments for the search_activities tool.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchActivitiesArgs {
    /// Account ID filter (optional, all accounts if not provided).
    pub account_id: Option<String>,
    /// Activity type filter (e.g., "BUY", "SELL", "DIVIDEND").
    pub activity_type: Option<String>,
    /// Symbol/asset keyword filter.
    pub symbol: Option<String>,
    /// Start date filter in YYYY-MM-DD format (optional).
    pub date_from: Option<String>,
    /// End date filter in YYYY-MM-DD format (optional).
    pub date_to: Option<String>,
    /// Page number (1-based, default: 1).
    pub page: Option<i64>,
    /// Number of results per page (default: 50, max: 200).
    pub page_size: Option<i64>,
}

/// DTO for activity data in tool output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDto {
    pub id: String,
    pub date: String,
    pub activity_type: String,
    pub symbol: Option<String>,
    pub quantity: Option<f64>,
    pub unit_price: Option<f64>,
    pub amount: Option<f64>,
    pub fee: Option<f64>,
    pub fx_rate: Option<f64>,
    pub currency: String,
    pub account_id: String,
    pub account_name: Option<String>,
    pub notes: Option<String>,
    /// money-hub: the owner's own note on this entry (their service).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub my_note: Option<String>,
    /// money-hub: the bank's full description, when it says more than `notes`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bank_text: Option<String>,
    /// money-hub: the bills or subscriptions the owner tracks this charge under.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bills: Vec<String>,
}

/// Output envelope for activities tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchActivitiesOutput {
    pub activities: Vec<ActivityDto>,
    pub count: usize,
    pub total_row_count: usize,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
    pub account_scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_amount: Option<f64>,
    /// money-hub: set when nothing matched the whole `symbol` text and these
    /// are the entries matching any one of its words instead.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_note: Option<String>,
}

/// Filler that would match half the bank lines ("PAYMENT THANK YOU").
const FILLER_WORDS: [&str; 8] = [
    "the", "and", "for", "with", "from", "total", "paid", "payment",
];

/// Words of a multi-word search worth trying one by one (3+ letters, no
/// filler, at most 6).
fn search_words(keyword: &str) -> Vec<String> {
    let mut words: Vec<String> = Vec::new();
    for word in keyword.split(|c: char| !c.is_alphanumeric()) {
        let word = word.to_lowercase();
        if word.chars().count() >= 3
            && !FILLER_WORDS.contains(&word.as_str())
            && !words.contains(&word)
        {
            words.push(word);
        }
    }
    if words.len() < 2 {
        return Vec::new();
    }
    words.truncate(6);
    words
}

/// money-hub: the owner's service's entries for `text`; a failure is logged
/// and the search goes on without them.
async fn lookup_hits(lookup: Option<&dyn EntryLookup>, text: &str) -> Vec<EntryExtras> {
    let Some(lookup) = lookup else {
        return Vec::new();
    };
    match lookup.search(text).await {
        Ok(hits) => hits,
        Err(e) => {
            log::warn!("money-hub lookup for {text:?} failed: {e}");
            Vec::new()
        }
    }
}

/// Fetch (with the same filters) the `ids` not already in `rows`.
fn add_missing(
    rows: &mut Vec<ActivityDetails>,
    ids: Vec<String>,
    fetch: impl Fn(Vec<String>) -> Result<ActivitySearchResponse, AgentToolError>,
) -> Result<(), AgentToolError> {
    let missing: Vec<String> = ids
        .into_iter()
        .filter(|id| !rows.iter().any(|row| &row.id == id))
        .collect();
    if !missing.is_empty() {
        rows.extend(fetch(missing)?.data);
    }
    Ok(())
}

/// Tool to search activities/transactions.
pub struct SearchActivities;

#[async_trait::async_trait]
impl AgentTool for SearchActivities {
    fn name(&self) -> &'static str {
        "search_activities"
    }

    fn description(&self) -> &'static str {
        "Search the user's transactions: bank and card spending, bills, income, transfers, and investment activity (buys, sells, dividends, deposits, withdrawals). Supports filtering, date ranges, and pagination. Returns paginated results with totalPages so you can request more pages if needed. To find a payee or purchase, put ONE distinctive word in `symbol` (for example \"sticker\", \"costco\", \"water\"): it is a case-insensitive substring match on the payee/description text and the security symbol/name. Bank descriptions are often abbreviated (\"CTYCHGO CLK STICKER\" is a City of Chicago sticker), so prefer the most specific word over a phrase. When a multi-word `symbol` matches nothing, the result lists entries matching any one of its words and says so in matchNote. It also searches the owner's own notes on entries, the bank's full description, and the names of the bills and subscriptions they track: rows can carry myNote, bankText and bills. When the owner names a bill or subscription, search that name; count the charges listed under it. Spending is usually WITHDRAWAL. Do not repeat a search that differs only in letter case."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "accountId": {
                    "type": "string",
                    "description": "Filter by account ID (optional, all accounts if not provided)"
                },
                "activityType": {
                    "type": "string",
                    "description": "Filter by activity type",
                    "enum": ["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL", "TRANSFER_IN", "TRANSFER_OUT", "INTEREST", "FEE", "SPLIT", "TAX"]
                },
                "symbol": {
                    "type": "string",
                    "description": "Text to look for in the payee/description or the security symbol/name (case-insensitive substring). One distinctive word works best."
                },
                "dateFrom": {
                    "type": "string",
                    "description": "Start date filter in YYYY-MM-DD format (optional)"
                },
                "dateTo": {
                    "type": "string",
                    "description": "End date filter in YYYY-MM-DD format (optional)"
                },
                "page": {
                    "type": "integer",
                    "description": "Page number, 1-based (default: 1)",
                    "default": 1
                },
                "pageSize": {
                    "type": "integer",
                    "description": "Number of results per page (default: 50, max: 200)",
                    "default": 50
                }
            },
            "required": []
        })
    }

    fn required_scopes(&self) -> &'static [AgentScope] {
        &[AgentScope::ActivitiesRead]
    }

    fn access_level(&self) -> AgentToolAccess {
        AgentToolAccess::Read
    }

    async fn call(
        &self,
        env: Arc<dyn AgentEnvironment>,
        args: serde_json::Value,
    ) -> Result<AgentToolResult, AgentToolError> {
        use chrono::NaiveDate;

        let args: SearchActivitiesArgs = serde_json::from_value(args)?;

        // Pagination: external tool API is 1-based, backend search uses 0-based page index
        let page = args.page.unwrap_or(1).max(1);
        let backend_page = page - 1;
        let page_size = args
            .page_size
            .unwrap_or(DEFAULT_PAGE_SIZE)
            .clamp(1, MAX_ACTIVITIES_ROWS as i64);

        let account_id = args.account_id.filter(|s| !s.is_empty());
        let activity_types = args
            .activity_type
            .filter(|s| !s.is_empty())
            .map(|t| vec![t]);
        let symbol_keyword = args.symbol.filter(|s| !s.is_empty());

        // Resolve account filter: if the value isn't a known account ID, try matching by name
        let account_ids = if let Some(ref raw) = account_id {
            let accounts = env
                .account_service()
                .get_active_non_archived_accounts()
                .unwrap_or_default();
            let is_known_id = accounts.iter().any(|a| a.id == *raw);
            if is_known_id {
                Some(vec![raw.clone()])
            } else {
                // Try case-insensitive name match
                let raw_lower = raw.to_lowercase();
                let matched: Vec<String> = accounts
                    .iter()
                    .filter(|a| a.name.to_lowercase() == raw_lower)
                    .map(|a| a.id.clone())
                    .collect();
                if matched.is_empty() {
                    // No match — pass raw value (will return 0 results)
                    Some(vec![raw.clone()])
                } else {
                    Some(matched)
                }
            }
        } else {
            None
        };

        // Parse date filters (skip empty strings)
        let date_from = args
            .date_from
            .filter(|s| !s.is_empty())
            .map(|s| {
                NaiveDate::parse_from_str(&s, "%Y-%m-%d").map_err(|_| {
                    AgentToolError::InvalidInput(format!("Invalid dateFrom format: {s}"))
                })
            })
            .transpose()?;
        let date_to = args
            .date_to
            .filter(|s| !s.is_empty())
            .map(|s| {
                NaiveDate::parse_from_str(&s, "%Y-%m-%d").map_err(|_| {
                    AgentToolError::InvalidInput(format!("Invalid dateTo format: {s}"))
                })
            })
            .transpose()?;

        // Sort by date descending
        let sort = Sort {
            id: "date".to_string(),
            desc: true,
        };

        // Search activities
        let search = |page: i64, size: i64, keyword: Option<String>, ids: Option<Vec<String>>| {
            env.activity_service()
                .search_activities(
                    page,
                    size,
                    account_ids.clone(),
                    activity_types.clone(),
                    keyword,
                    Some(Sort {
                        id: sort.id.clone(),
                        desc: sort.desc,
                    }),
                    None, // needs_review_filter
                    date_from,
                    date_to,
                    None, // instrument_type_filter
                    ids,  // activity_id_filter
                )
                .map_err(|e| AgentToolError::ExecutionFailed(e.to_string()))
        };
        let response = search(backend_page, page_size, symbol_keyword.clone(), None)?;
        let mut rows = response.data;
        let mut total_row_count = response.meta.total_row_count as usize;
        let mut match_note = None;

        // money-hub: the owner's service knows what the activities table does
        // not (their own notes, the bank's full text, which bill a charge is
        // on). Entries it finds join the results, same filters, with those
        // details. Bank text is also abbreviated ("CTYCHGO CLK STICKER"), so a
        // phrase that matches nothing as written ("city sticker") lists what
        // matches any one of its words instead, in this call, so the model
        // does not guess spellings over many calls.
        let lookup = env.entry_lookup();
        let mut extras: HashMap<String, EntryExtras> = HashMap::new();
        if let Some(keyword) = symbol_keyword.as_deref() {
            let mut matched: Option<Vec<ActivityDetails>> = None;
            let hits = lookup_hits(lookup.as_deref(), keyword).await;
            if !hits.is_empty() {
                let mut all = search(
                    0,
                    MAX_ACTIVITIES_ROWS as i64,
                    Some(keyword.to_string()),
                    None,
                )?
                .data;
                let ids = hits.iter().map(|h| h.id.clone()).collect::<Vec<_>>();
                add_missing(&mut all, ids, |ids| {
                    search(0, MAX_ACTIVITIES_ROWS as i64, None, Some(ids))
                })?;
                extras.extend(hits.into_iter().map(|h| (h.id.clone(), h)));
                matched = Some(all);
            }
            let found_none = matched.as_ref().map_or(total_row_count == 0, Vec::is_empty);
            let words = search_words(keyword);
            if found_none && !words.is_empty() {
                let mut all = Vec::new();
                for word in &words {
                    all.extend(
                        search(0, MAX_ACTIVITIES_ROWS as i64, Some(word.clone()), None)?.data,
                    );
                    let hits = lookup_hits(lookup.as_deref(), word).await;
                    let ids = hits.iter().map(|h| h.id.clone()).collect::<Vec<_>>();
                    add_missing(&mut all, ids, |ids| {
                        search(0, MAX_ACTIVITIES_ROWS as i64, None, Some(ids))
                    })?;
                    for hit in hits {
                        extras.entry(hit.id.clone()).or_insert(hit);
                    }
                }
                if !all.is_empty() {
                    match_note = Some(format!(
                        "Nothing contains \"{keyword}\" as written. These entries contain at least one of: {}. Check each one before using it.",
                        words.join(", ")
                    ));
                }
                matched = Some(all);
            }
            if let Some(mut all) = matched {
                let mut seen = std::collections::HashSet::new();
                all.retain(|row| seen.insert(row.id.clone()));
                all.sort_by(|a, b| b.date.cmp(&a.date));
                total_row_count = all.len();
                rows = all
                    .into_iter()
                    .skip((backend_page * page_size) as usize)
                    .take(page_size as usize)
                    .collect();
            }
        }

        let total_pages = ((total_row_count as i64) + page_size - 1) / page_size;

        // Convert to DTOs
        let activities: Vec<ActivityDto> = rows
            .into_iter()
            .map(|a| {
                let quantity = a.quantity.as_ref().and_then(|v| v.parse::<f64>().ok());
                let unit_price = a.unit_price.as_ref().and_then(|v| v.parse::<f64>().ok());
                let fee = a.fee.as_ref().and_then(|v| v.parse::<f64>().ok());
                let fx_rate = a.fx_rate.as_ref().and_then(|v| v.parse::<f64>().ok());
                let amount = a.amount.as_ref().and_then(|s| s.parse::<f64>().ok());
                let extra = extras.get(&a.id);

                ActivityDto {
                    id: a.id,
                    date: a.date.clone(),
                    activity_type: a.activity_type,
                    symbol: if a.asset_symbol.is_empty() {
                        None
                    } else {
                        Some(a.asset_symbol)
                    },
                    quantity,
                    unit_price,
                    amount,
                    fee,
                    fx_rate,
                    currency: a.currency,
                    account_id: a.account_id.clone(),
                    account_name: Some(a.account_name),
                    my_note: extra.and_then(|x| x.my_note.clone()),
                    bank_text: extra.and_then(|x| x.bank_text.clone()),
                    bills: extra.map(|x| x.bills.clone()).unwrap_or_default(),
                    notes: a.comment,
                }
            })
            .collect();

        let returned_count = activities.len();

        // Calculate totals for metadata
        let total_amount: f64 = activities.iter().filter_map(|a| a.amount).sum();

        let account_scope = account_id.unwrap_or_else(|| "all".to_string());

        let output = SearchActivitiesOutput {
            activities,
            count: returned_count,
            total_row_count,
            page,
            page_size,
            total_pages,
            account_scope,
            total_amount: if total_amount > 0.0 {
                Some(total_amount)
            } else {
                None
            },
            match_note,
        };
        Ok(AgentToolResult {
            content: serde_json::to_value(output)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::search_words;

    #[test]
    fn search_words_splits_phrases_only() {
        assert_eq!(search_words("city sticker"), vec!["city", "sticker"]);
        assert_eq!(search_words("City of Chicago"), vec!["city", "chicago"]);
        assert!(search_words("sticker").is_empty());
        assert!(search_words("ab cd").is_empty());
        assert_eq!(search_words("Water-water bill"), vec!["water", "bill"]);
        assert_eq!(
            search_words("total paid for city sticker"),
            vec!["city", "sticker"]
        );
    }
}
