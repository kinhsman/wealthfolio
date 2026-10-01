//! money-hub: the owner's money-hub service as an [`EntryLookup`] for the
//! assistant's activity search.
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
use wealthfolio_agent_tools::{EntryExtras, EntryLookup};

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
