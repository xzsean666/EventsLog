use eventslog_protocol::Event;
use eventslog_schema::ExecutionRow;
use reqwest::Client;
use std::time::Duration;
use thiserror::Error;
use tokio::sync::mpsc::Receiver;
use tokio::task::JoinHandle;
use tracing::{error, warn};

/// Standard query parameter string enforcing ClickHouse production optimization blueprint.
pub const OPTIMIZED_QUERY_PARAMS: &str =
    "async_insert=1&wait_for_async_insert=1&async_insert_busy_timeout_ms=200&log_queries=0&date_time_input_format=best_effort";

/// Errors encountered while persisting event batches to ClickHouse.
#[derive(Debug, Error)]
pub enum ClickHouseWriteError {
    #[error("HTTP transport error: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("ClickHouse returned error status {status}: {message}")]
    ServerError {
        status: reqwest::StatusCode,
        message: String,
    },
    #[error("Failed to serialize execution row: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Insert failed after maximum retries")]
    MaxRetriesExceeded,
}

/// Client responsible for formatting and bulk-inserting event batches into ClickHouse.
#[derive(Debug, Clone)]
pub struct ClickHouseWriter {
    client: Client,
    target_url: String,
    max_retries: usize,
}

impl ClickHouseWriter {
    /// Constructs a new ClickHouseWriter for the given base endpoint.
    pub fn new(base_url: &str) -> Self {
        let trimmed = base_url.trim_end_matches('/');
        let delimiter = if trimmed.contains('?') { "&" } else { "?" };
        let target_url = format!("{trimmed}/{delimiter}{OPTIMIZED_QUERY_PARAMS}");

        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(32)
            .build()
            .unwrap_or_default();

        Self {
            client,
            target_url,
            max_retries: 3,
        }
    }

    /// Returns the active destination URL including all required query parameters.
    pub fn target_url(&self) -> &str {
        &self.target_url
    }

    /// Formats a batch of events into newline-delimited JSON format for ClickHouse.
    pub fn format_json_each_row_body(&self, events: &[Event]) -> Result<String, ClickHouseWriteError> {
        let mut body = String::new();
        // Insert statement prefix
        body.push_str("INSERT INTO eventslog.function_executions FORMAT JSONEachRow\n");
        for event in events {
            let row = ExecutionRow::from(event);
            let json_line = serde_json::to_string(&row)?;
            body.push_str(&json_line);
            body.push('\n');
        }
        Ok(body)
    }

    /// Writes an event batch to ClickHouse with exponential backoff retries.
    pub async fn write_batch(&self, events: Vec<Event>) -> Result<(), ClickHouseWriteError> {
        if events.is_empty() {
            return Ok(());
        }

        let body = self.format_json_each_row_body(&events)?;
        let mut backoff = Duration::from_millis(50);

        for attempt in 1..=self.max_retries {
            let response = self
                .client
                .post(&self.target_url)
                .header("Content-Type", "text/plain")
                .body(body.clone())
                .send()
                .await;

            match response {
                Ok(resp) if resp.status().is_success() => {
                    return Ok(());
                }
                Ok(resp) => {
                    let status = resp.status();
                    let message = resp.text().await.unwrap_or_default();
                    warn!(
                        attempt = attempt,
                        status = %status,
                        message = %message,
                        "ClickHouse insert failed"
                    );
                }
                Err(err) => {
                    warn!(
                        attempt = attempt,
                        error = %err,
                        "ClickHouse connection error"
                    );
                }
            }

            if attempt < self.max_retries {
                tokio::time::sleep(backoff).await;
                backoff *= 2;
            }
        }

        error!(
            event_count = events.len(),
            "ClickHouse batch insert failed after {} attempts. Dropping batch.",
            self.max_retries
        );
        Err(ClickHouseWriteError::MaxRetriesExceeded)
    }

    /// Spawns a background task that reads batches from `rx` and writes them to ClickHouse.
    pub fn spawn_consumer(self, mut rx: Receiver<Vec<Event>>) -> JoinHandle<()> {
        tokio::spawn(async move {
            while let Some(batch) = rx.recv().await {
                if let Err(e) = self.write_batch(batch).await {
                    error!("Error during batched ClickHouse write: {e}");
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::Query;
    use axum::routing::post;
    use axum::Router;
    use eventslog_protocol::{ExecutionStatus, FunctionExecution, FunctionIdentity};
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn sample_event(name: &str) -> Event {
        let exec = FunctionExecution {
            function: FunctionIdentity::new("test_mod", name),
            input_payload: Some(json!({"x": 10})),
            output_payload: Some(json!({"y": 20})),
            duration_nanos: 5_000_000,
            status: ExecutionStatus::Success,
            error: None,
            attributes: None,
        };
        Event::new_function_execution("trace-ck", "span-ck", "test-svc", "dev", exec)
    }

    #[test]
    fn test_url_contains_all_optimized_params() {
        let writer = ClickHouseWriter::new("http://localhost:8123");
        let url = writer.target_url();

        assert!(url.contains("async_insert=1"));
        assert!(url.contains("wait_for_async_insert=1"));
        assert!(url.contains("async_insert_busy_timeout_ms=200"));
        assert!(url.contains("log_queries=0"));
    }

    #[test]
    fn test_batch_formatting_json_each_row() {
        let writer = ClickHouseWriter::new("http://localhost:8123");
        let events = vec![sample_event("f1"), sample_event("f2")];

        let formatted = writer.format_json_each_row_body(&events).unwrap();

        let lines: Vec<&str> = formatted.trim().split('\n').collect();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0], "INSERT INTO eventslog.function_executions FORMAT JSONEachRow");

        // Verify each line is valid JSON representing an ExecutionRow
        let row1: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(row1["function_name"], "f1");
        assert_eq!(row1["service_name"], "test-svc");

        let row2: serde_json::Value = serde_json::from_str(lines[2]).unwrap();
        assert_eq!(row2["function_name"], "f2");
    }

    #[tokio::test]
    async fn test_mock_clickhouse_bulk_insert() {
        let request_counter = Arc::new(AtomicUsize::new(0));
        let counter_clone = request_counter.clone();

        let mock_app = Router::new().route(
            "/",
            post(move |Query(params): Query<HashMap<String, String>>, body: String| {
                let counter = counter_clone.clone();
                async move {
                    counter.fetch_add(1, Ordering::Relaxed);
                    // Verify required query params
                    assert_eq!(params.get("async_insert").map(|s| s.as_str()), Some("1"));
                    assert_eq!(params.get("wait_for_async_insert").map(|s| s.as_str()), Some("1"));
                    assert_eq!(params.get("log_queries").map(|s| s.as_str()), Some("0"));
                    assert!(body.starts_with("INSERT INTO eventslog.function_executions"));
                    axum::http::StatusCode::OK
                }
            }),
        );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let mock_server = tokio::spawn(async move {
            axum::serve(listener, mock_app).await.unwrap();
        });

        let writer = ClickHouseWriter::new(&format!("http://127.0.0.1:{port}"));
        let events = vec![sample_event("mock_call")];

        let res = writer.write_batch(events).await;
        assert!(res.is_ok(), "Write batch to mock ClickHouse should succeed");
        assert_eq!(request_counter.load(Ordering::Relaxed), 1);

        mock_server.abort();
    }
}
