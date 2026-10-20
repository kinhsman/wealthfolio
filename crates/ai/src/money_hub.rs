//! money-hub: the owner's money-hub service as an [`EntryLookup`] for the
//! assistant's activity search, and the source of [`GetImportantDates`]
//! (the Calendar's people, their days and gifts; owner, 10-20: "provide
//! access to the AI assistant so it can plan gifts for me, based on
//! relationship with me, their age, gender").
//!
//! The owner's notes, the bank's full description and the bills and
//! subscriptions each charge belongs to live in that service, not in the
//! activities table, so the assistant could not see them (10-01: it answered
//! $100.17 for the city sticker while the owner's note "Sticker" sat on a
//! second charge). Configured by `MONEY_HUB_LOOKUP_URL` and
//! `MONEY_HUB_LOOKUP_TOKEN`; without both there is no lookup.

use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use wealthfolio_agent_tools::{
    AgentEnvironment, AgentScope, AgentTool, AgentToolAccess, AgentToolError, AgentToolResult,
    EntryExtras, EntryLookup,
};

/// The Calendar tool's name; offered with the transaction tools (streaming.rs).
pub const IMPORTANT_DATES_TOOL: &str = "get_important_dates";

const TIMEOUT: Duration = Duration::from_secs(5);

pub struct MoneyHubLookup {
    url: String,
    token: String,
    client: reqwest::Client,
}

#[derive(Deserialize)]
struct SearchResponse {
    entries: Vec<EntryExtras>,
}

impl MoneyHubLookup {
    pub fn new(url: &str, token: &str) -> Result<Self, String> {
        let client = wealthfolio_http::client_builder()
            .timeout(TIMEOUT)
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            url: url.trim_end_matches('/').to_string(),
            token: token.to_string(),
            client,
        })
    }

    /// The lookup named by the environment, if both settings are there.
    pub fn from_env() -> Option<Arc<dyn EntryLookup>> {
        let url = std::env::var("MONEY_HUB_LOOKUP_URL").ok()?;
        let token = std::env::var("MONEY_HUB_LOOKUP_TOKEN").ok()?;
        if url.trim().is_empty() || token.trim().is_empty() {
            return None;
        }
        match Self::new(url.trim(), token.trim()) {
            Ok(lookup) => Some(Arc::new(lookup)),
            Err(e) => {
                log::warn!("money-hub lookup not available: {e}");
                None
            }
        }
    }
}

#[async_trait::async_trait]
impl EntryLookup for MoneyHubLookup {
    async fn search(&self, text: &str) -> Result<Vec<EntryExtras>, String> {
        let response = self
            .client
            .get(format!("{}/search", self.url))
            .query(&[("q", text)])
            .header("x-money-hub-token", &self.token)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("money-hub lookup answered {}", response.status()));
        }
        let body: SearchResponse = response.json().await.map_err(|e| e.to_string())?;
        Ok(body.entries)
    }

    async fn important_dates(
        &self,
        person: Option<&str>,
        days: Option<u32>,
    ) -> Result<serde_json::Value, String> {
        let mut query: Vec<(&str, String)> = Vec::new();
        if let Some(p) = person.map(str::trim).filter(|p| !p.is_empty()) {
            query.push(("person", p.to_string()));
        }
        if let Some(d) = days {
            query.push(("days", d.to_string()));
        }
        let response = self
            .client
            .get(format!("{}/dates", self.url))
            .query(&query)
            .header("x-money-hub-token", &self.token)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("money-hub lookup answered {}", response.status()));
        }
        response.json().await.map_err(|e| e.to_string())
    }
}

/// The owner's people and important days, for gift planning and "when is Mom's birthday".
pub struct GetImportantDates;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetImportantDatesArgs {
    #[serde(default)]
    person: Option<String>,
    #[serde(default)]
    days_ahead: Option<u32>,
}

#[async_trait::async_trait]
impl AgentTool for GetImportantDates {
    fn name(&self) -> &'static str {
        IMPORTANT_DATES_TOOL
    }

    fn description(&self) -> &'static str {
        "Get the owner's people and important days from their Calendar: each person's relationship to the \
         owner, gender, age, likes and interests, notes, gift budget, gift ideas already jotted down and \
         gifts given before (what, how much, when, for which day), plus the upcoming birthdays, anniversaries, \
         memorial days (giỗ, lunar) and holidays the owner plans gifts for, with dates and budgets. Use it to \
         plan or suggest gifts, or to answer when someone's day is. Optional `person` narrows to names \
         containing it; `daysAhead` (default 120, up to 400) is how far ahead to list days."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "person": {
                    "type": "string",
                    "description": "Part of a person's name (e.g. \"Mom\"); omit for everyone."
                },
                "daysAhead": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 400,
                    "description": "How many days ahead to list important days (default 120)."
                }
            },
            "required": []
        })
    }

    fn required_scopes(&self) -> &'static [AgentScope] {
        &[AgentScope::FinancialPlanningRead]
    }

    fn access_level(&self) -> AgentToolAccess {
        AgentToolAccess::Read
    }

    async fn call(
        &self,
        env: Arc<dyn AgentEnvironment>,
        args: serde_json::Value,
    ) -> Result<AgentToolResult, AgentToolError> {
        let args: GetImportantDatesArgs = if args.is_null() {
            GetImportantDatesArgs::default()
        } else {
            serde_json::from_value(args)?
        };
        let lookup = env.entry_lookup().ok_or_else(|| {
            AgentToolError::ExecutionFailed("The Calendar is not connected.".to_string())
        })?;
        let content = lookup
            .important_dates(
                args.person.as_deref(),
                args.days_ahead.map(|d| d.clamp(1, 400)),
            )
            .await
            .map_err(AgentToolError::ExecutionFailed)?;
        Ok(AgentToolResult { content })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn sends_the_text_and_token_and_reads_the_entries() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = vec![0; 4096];
            let n = socket.read(&mut request).await.unwrap();
            let body = r#"{"entries":[{"id":"a1","myNote":"Sticker","bankText":"CITY OF CHICAGO PURCHASE","bills":["City Sticker"]}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
            String::from_utf8_lossy(&request[..n]).to_string()
        });
        let lookup = MoneyHubLookup::new(&format!("http://{address}/"), "fixture-token").unwrap();
        let entries = lookup.search("city sticker").await.unwrap();
        let request = server.await.unwrap();
        assert!(request.starts_with("GET /search?q=city+sticker "));
        assert!(request
            .to_lowercase()
            .contains("x-money-hub-token: fixture-token"));
        assert_eq!(
            entries,
            vec![EntryExtras {
                id: "a1".into(),
                my_note: Some("Sticker".into()),
                bank_text: Some("CITY OF CHICAGO PURCHASE".into()),
                bills: vec!["City Sticker".into()],
            }]
        );
    }

    #[tokio::test]
    async fn asks_for_the_important_dates_with_person_days_and_token() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = vec![0; 4096];
            let n = socket.read(&mut request).await.unwrap();
            let body =
                r#"{"today":"2026-10-20","people":[{"name":"Mom","relationship":"Mother"}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
            String::from_utf8_lossy(&request[..n]).to_string()
        });
        let lookup = MoneyHubLookup::new(&format!("http://{address}"), "fixture-token").unwrap();
        let value = lookup
            .important_dates(Some(" Mom "), Some(60))
            .await
            .unwrap();
        let request = server.await.unwrap();
        assert!(request.starts_with("GET /dates?person=Mom&days=60 "));
        assert!(request
            .to_lowercase()
            .contains("x-money-hub-token: fixture-token"));
        assert_eq!(value["people"][0]["name"], "Mom");
    }

    #[tokio::test]
    async fn the_tool_says_so_when_no_calendar_is_connected() {
        let env: Arc<dyn AgentEnvironment> = Arc::new(crate::env::test_env::MockEnvironment::new());
        let error = GetImportantDates
            .call(env, serde_json::json!({}))
            .await
            .unwrap_err();
        assert!(error.to_string().contains("Calendar is not connected"));
    }

    #[tokio::test]
    async fn a_refusal_is_an_error_not_an_empty_list() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = vec![0; 4096];
            let _ = socket.read(&mut request).await.unwrap();
            socket
                .write_all(
                    b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await
                .unwrap();
        });
        let lookup = MoneyHubLookup::new(&format!("http://{address}"), "wrong").unwrap();
        assert!(lookup.search("x").await.is_err());
    }
}
