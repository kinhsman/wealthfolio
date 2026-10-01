#![cfg(feature = "test-utils")]

//! money-hub: a phrase that matches nothing as written ("city sticker" against
//! the bank's "CTYCHGO CLK STICKER") falls back to entries with any one word.

use std::sync::Arc;
use wealthfolio_agent_tools::{tools::SearchActivities, AgentTool, EntryExtras, EntryLookup};
use wealthfolio_ai::env::test_env::{MockActivityService, MockEnvironment};
use wealthfolio_core::activities::ActivityDetails;

fn bank_entry(id: &str, date: &str, notes: &str, amount: &str) -> ActivityDetails {
    serde_json::from_value(serde_json::json!({
        "id": id,
        "accountId": "card-1",
        "assetId": "cash-usd",
        "activityType": "WITHDRAWAL",
        "status": "POSTED",
        "date": date,
        "currency": "USD",
        "amount": amount,
        "needsReview": false,
        "comment": notes,
        "createdAt": date,
        "updatedAt": date,
        "accountName": "Synthetic card",
        "accountCurrency": "USD",
        "assetSymbol": "USD",
        "assetPricingMode": "NONE",
        "isUserModified": false
    }))
    .unwrap()
}

/// Stands in for the owner's money-hub service: the note "Sticker" on the
/// April charge, both charges on the bill "City Sticker".
struct OwnersService;

#[async_trait::async_trait]
impl EntryLookup for OwnersService {
    async fn search(&self, text: &str) -> Result<Vec<EntryExtras>, String> {
        let text = text.to_lowercase();
        let april = EntryExtras {
            id: "april".into(),
            my_note: Some("Sticker".into()),
            bank_text: Some("CITY OF CHICAGO PURCHASE 932".into()),
            bills: vec!["City Sticker".into()],
        };
        let sticker = EntryExtras {
            id: "sticker".into(),
            bills: vec!["City Sticker".into()],
            ..EntryExtras::default()
        };
        Ok(match text.as_str() {
            "sticker" | "city sticker" => vec![april, sticker],
            _ => vec![],
        })
    }
}

async fn search(args: serde_json::Value) -> serde_json::Value {
    search_with(args, None).await
}

async fn search_with(
    args: serde_json::Value,
    lookup: Option<Arc<dyn EntryLookup>>,
) -> serde_json::Value {
    let mut env = MockEnvironment::new();
    env.entry_lookup = lookup;
    env.activity_service = Arc::new(MockActivityService {
        activities: vec![
            bank_entry(
                "sticker",
                "2024-12-22T17:00:00Z",
                "CTYCHGO CLK STICKER",
                "100.17",
            ),
            bank_entry(
                "water",
                "2025-01-09T17:00:00Z",
                "CITY OF CHICAGO WATER BILL",
                "156.96",
            ),
            bank_entry("costco", "2025-01-12T17:00:00Z", "Costco", "49.17"),
            bank_entry("april", "2026-04-21T17:00:00Z", "City Of Chicago", "87.67"),
        ],
    });
    SearchActivities
        .call(Arc::new(env), args)
        .await
        .unwrap()
        .content
}

fn ids(result: &serde_json::Value) -> Vec<&str> {
    result["activities"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["id"].as_str().unwrap())
        .collect()
}

#[tokio::test]
async fn a_phrase_with_no_match_lists_entries_with_any_of_its_words() {
    let result = search(serde_json::json!({"symbol": "city sticker"})).await;
    assert_eq!(ids(&result), vec!["april", "water", "sticker"]);
    assert_eq!(result["totalRowCount"], 3);
    let note = result["matchNote"].as_str().unwrap();
    assert!(note.contains("city sticker"));
    assert!(note.contains("city, sticker"));
}

#[tokio::test]
async fn a_matching_search_is_unchanged() {
    let result = search(serde_json::json!({"symbol": "sticker"})).await;
    assert_eq!(ids(&result), vec!["sticker"]);
    assert!(result.get("matchNote").is_none());

    let result = search(serde_json::json!({"symbol": "CTYCHGO CLK"})).await;
    assert_eq!(ids(&result), vec!["sticker"]);
    assert!(result.get("matchNote").is_none());
}

#[tokio::test]
async fn no_word_matches_either() {
    let result = search(serde_json::json!({"symbol": "parking garage"})).await;
    assert!(ids(&result).is_empty());
    assert_eq!(result["totalRowCount"], 0);
    assert!(result.get("matchNote").is_none());
}

#[tokio::test]
async fn the_owners_notes_and_bills_join_the_results() {
    let service: Option<Arc<dyn EntryLookup>> = Some(Arc::new(OwnersService));
    let result = search_with(serde_json::json!({"symbol": "sticker"}), service.clone()).await;
    assert_eq!(ids(&result), vec!["april", "sticker"]);
    assert_eq!(result["totalRowCount"], 2);
    let april = &result["activities"][0];
    assert_eq!(april["myNote"], "Sticker");
    assert_eq!(april["bills"], serde_json::json!(["City Sticker"]));
    assert!(result.get("matchNote").is_none());

    // The bill's name finds both charges although no payee says it.
    let result = search_with(serde_json::json!({"symbol": "city sticker"}), service).await;
    assert_eq!(ids(&result), vec!["april", "sticker"]);
    assert!(result.get("matchNote").is_none());
}

#[tokio::test]
async fn without_the_service_nothing_changes() {
    let result = search(serde_json::json!({"symbol": "sticker"})).await;
    assert_eq!(ids(&result), vec!["sticker"]);
    assert!(result["activities"][0].get("myNote").is_none());
}
