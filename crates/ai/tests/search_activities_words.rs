#![cfg(feature = "test-utils")]

//! money-hub: a phrase that matches nothing as written ("city sticker" against
//! the bank's "CTYCHGO CLK STICKER") falls back to entries with any one word.

use std::sync::Arc;
use wealthfolio_agent_tools::{tools::SearchActivities, AgentTool};
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

async fn search(args: serde_json::Value) -> serde_json::Value {
    let mut env = MockEnvironment::new();
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
    assert_eq!(ids(&result), vec!["water", "sticker"]);
    assert_eq!(result["totalRowCount"], 2);
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
