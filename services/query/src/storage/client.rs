use chrono::{DateTime, Utc};
use eventslog_schema::ExecutionRow;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;
use tracing::warn;

/// Storage errors encountered during query execution.
#[derive(Debug, Error)]
pub enum QueryStorageError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Deserialization error: {0}")]
    Deserialization(#[from] serde_json::Error),
    #[error("ClickHouse error ({status}): {message}")]
    ServerError {
        status: reqwest::StatusCode,
        message: String,
    },
}

/// Filter criteria for querying observed functions.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct FunctionFilter {
    pub service_name: Option<String>,
    pub environment: Option<String>,
    pub search: Option<String>,
    pub limit: Option<usize>,
}

/// Aggregated function summary row.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FunctionSummary {
    #[serde(default)]
    pub function_id: String,
    pub service_name: String,
    pub module_name: String,
    #[serde(default)]
    pub module: String,
    #[serde(default)]
    pub class_name: Option<String>,
    pub function_name: String,
    #[serde(default)]
    pub call_count: u64,
    #[serde(default)]
    pub total_executions: u64,
    #[serde(default)]
    pub error_count: u64,
    #[serde(default)]
    pub total_errors: u64,
    #[serde(default)]
    pub avg_duration_ms: f64,
    pub last_seen: DateTime<Utc>,
}

/// Filter criteria for querying individual function execution records.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionFilter {
    pub service_name: Option<String>,
    pub environment: Option<String>,
    pub function_name: Option<String>,
    pub status: Option<String>,
    pub trace_id: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

/// Escape input strings to defend against SQL injection in ClickHouse statements.
pub fn escape_sql_string(input: &str) -> String {
    input.replace('\\', "\\\\").replace('\'', "''")
}

/// Client executing ClickHouse analytical queries.
#[derive(Debug, Clone)]
pub struct ClickHouseStorageClient {
    client: Client,
    endpoint: String,
}

impl ClickHouseStorageClient {
    /// Constructs a new ClickHouseStorageClient pointing to the ClickHouse HTTP endpoint.
    pub fn new(base_url: &str) -> Self {
        let endpoint = format!("{}/?log_queries=0", base_url.trim_end_matches('/'));
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .pool_max_idle_per_host(16)
            .build()
            .unwrap_or_default();

        Self { client, endpoint }
    }

    /// Builds SQL query to aggregate function call statistics.
    pub fn build_functions_query(&self, filter: &FunctionFilter) -> String {
        let mut conditions = vec!["1 = 1".to_string()];

        if let Some(ref svc) = filter::sanitize_opt(&filter.service_name) {
            conditions.push(format!("service_name = '{svc}'"));
        }
        if let Some(ref env) = filter::sanitize_opt(&filter.environment) {
            conditions.push(format!("environment = '{env}'"));
        }
        if let Some(ref search) = filter::sanitize_like_opt(&filter.search) {
            conditions.push(format!(
                "(function_name LIKE '%{search}%' OR module_name LIKE '%{search}%')"
            ));
        }

        let where_clause = conditions.join(" AND ");
        let limit = filter.limit.unwrap_or(100).min(1000);

        format!(
            "SELECT \
                concat(service_name, ':', module_name, ':', function_name) AS function_id, \
                service_name, \
                module_name, \
                module_name AS module, \
                any(class_name) AS class_name, \
                function_name, \
                toUInt64(count()) AS call_count, \
                toUInt64(count()) AS total_executions, \
                toUInt64(countIf(status = 'error')) AS error_count, \
                toUInt64(countIf(status = 'error')) AS total_errors, \
                round(avg(duration_ms), 2) AS avg_duration_ms, \
                max(timestamp) AS last_seen \
            FROM eventslog.function_executions \
            WHERE {where_clause} \
            GROUP BY service_name, module_name, function_name \
            ORDER BY call_count DESC \
            LIMIT {limit} \
            FORMAT JSONEachRow"
        )
    }

    /// Builds SQL query to fetch execution records.
    pub fn build_executions_query(&self, filter: &ExecutionFilter) -> String {
        let mut conditions = vec!["1 = 1".to_string()];

        if let Some(ref svc) = filter::sanitize_opt(&filter.service_name) {
            conditions.push(format!("service_name = '{svc}'"));
        }
        if let Some(ref env) = filter::sanitize_opt(&filter.environment) {
            conditions.push(format!("environment = '{env}'"));
        }
        if let Some(ref func) = filter::sanitize_opt(&filter.function_name) {
            conditions.push(format!("function_name = '{func}'"));
        }
        if let Some(ref status) = filter::sanitize_opt(&filter.status) {
            conditions.push(format!("status = '{status}'"));
        }
        if let Some(ref trace) = filter::sanitize_opt(&filter.trace_id) {
            conditions.push(format!("trace_id = '{trace}'"));
        }

        let where_clause = conditions.join(" AND ");
        let limit = filter.limit.unwrap_or(50).min(1000);
        let offset = filter.offset.unwrap_or(0);

        format!(
            "SELECT * FROM eventslog.function_executions \
            WHERE {where_clause} \
            ORDER BY timestamp DESC \
            LIMIT {limit} OFFSET {offset} \
            FORMAT JSONEachRow"
        )
    }

    /// Builds SQL query to fetch all spans belonging to a trace tree.
    pub fn build_trace_query(&self, trace_id: &str) -> String {
        let escaped_trace = escape_sql_string(trace_id);
        format!(
            "SELECT * FROM eventslog.function_executions \
            WHERE trace_id = '{escaped_trace}' \
            ORDER BY timestamp ASC \
            FORMAT JSONEachRow"
        )
    }

    /// Executes raw ClickHouse query and parses newline-delimited JSONEachRow results.
    pub async fn execute_query<T: for<'de> Deserialize<'de>>(
        &self,
        sql: &str,
    ) -> Result<Vec<T>, QueryStorageError> {
        let response = self
            .client
            .post(&self.endpoint)
            .body(sql.to_string())
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let message = response.text().await.unwrap_or_default();
            warn!(status = %status, message = %message, "ClickHouse query returned error");
            return Err(QueryStorageError::ServerError { status, message });
        }

        let text = response.text().await?;
        let mut results = Vec::new();

        for line in text.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                let row: T = serde_json::from_str(trimmed)?;
                results.push(row);
            }
        }

        Ok(results)
    }

    /// Queries list of observed functions matching filter.
    pub async fn query_functions(
        &self,
        filter: &FunctionFilter,
    ) -> Result<Vec<FunctionSummary>, QueryStorageError> {
        let sql = self.build_functions_query(filter);
        let mut rows: Vec<FunctionSummary> = self.execute_query(&sql).await?;
        for f in &mut rows {
            if f.function_id.is_empty() {
                f.function_id = format!("{}:{}:{}", f.service_name, f.module_name, f.function_name);
            }
            if f.module.is_empty() {
                f.module = f.module_name.clone();
            }
            if f.total_executions == 0 && f.call_count > 0 {
                f.total_executions = f.call_count;
            }
            if f.total_errors == 0 && f.error_count > 0 {
                f.total_errors = f.error_count;
            }
        }
        Ok(rows)
    }

    /// Queries executions list matching filter.
    pub async fn query_executions(
        &self,
        filter: &ExecutionFilter,
    ) -> Result<Vec<ExecutionRow>, QueryStorageError> {
        let sql = self.build_executions_query(filter);
        self.execute_query(&sql).await
    }

    /// Queries trace execution hierarchy.
    pub async fn query_trace(
        &self,
        trace_id: &str,
    ) -> Result<Vec<ExecutionRow>, QueryStorageError> {
        let sql = self.build_trace_query(trace_id);
        self.execute_query(&sql).await
    }
}

mod filter {
    use super::escape_sql_string;

    pub fn sanitize_opt(opt: &Option<String>) -> Option<String> {
        opt.as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(escape_sql_string)
    }

    pub fn sanitize_like_opt(opt: &Option<String>) -> Option<String> {
        opt.as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| {
                escape_sql_string(s)
                    .replace('%', "\\%")
                    .replace('_', "\\_")
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::post;
    use axum::Router;

    #[test]
    fn test_build_functions_query() {
        let client = ClickHouseStorageClient::new("http://localhost:8123");
        let filter = FunctionFilter {
            service_name: Some("order-service".to_string()),
            environment: Some("prod".to_string()),
            search: Some("checkout".to_string()),
            limit: Some(25),
        };

        let sql = client.build_functions_query(&filter);
        assert!(sql.contains("service_name = 'order-service'"));
        assert!(sql.contains("environment = 'prod'"));
        assert!(sql.contains("function_name LIKE '%checkout%'"));
        assert!(sql.contains("LIMIT 25"));
        assert!(sql.contains("FORMAT JSONEachRow"));
    }

    #[test]
    fn test_build_executions_query() {
        let client = ClickHouseStorageClient::new("http://localhost:8123");
        let filter = ExecutionFilter {
            function_name: Some("create_order".to_string()),
            status: Some("error".to_string()),
            limit: Some(10),
            offset: Some(20),
            ..Default::default()
        };

        let sql = client.build_executions_query(&filter);
        assert!(sql.contains("function_name = 'create_order'"));
        assert!(sql.contains("status = 'error'"));
        assert!(sql.contains("LIMIT 10 OFFSET 20"));
    }

    #[test]
    fn test_build_trace_query_escapes_input() {
        let client = ClickHouseStorageClient::new("http://localhost:8123");
        let sql = client.build_trace_query("trace' OR '1'='1");
        assert!(sql.contains("trace'' OR ''1''=''1"));
    }

    #[tokio::test]
    async fn test_mock_query_functions() {
        let mock_app = Router::new().route(
            "/",
            post(|_body: String| async {
                let json_line = r#"{"service_name":"auth-svc","module_name":"auth","function_name":"login","call_count":150,"error_count":3,"avg_duration_ms":12.5,"last_seen":"2026-09-29T10:00:00Z"}"#;
                json_line.to_string()
            }),
        );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let mock_server = tokio::spawn(async move {
            axum::serve(listener, mock_app).await.unwrap();
        });

        let client = ClickHouseStorageClient::new(&format!("http://127.0.0.1:{port}"));
        let functions = client
            .query_functions(&FunctionFilter::default())
            .await
            .expect("query functions");

        assert_eq!(functions.len(), 1);
        assert_eq!(functions[0].function_name, "login");
        assert_eq!(functions[0].call_count, 150);
        assert_eq!(functions[0].error_count, 3);
        assert_eq!(functions[0].avg_duration_ms, 12.5);

        mock_server.abort();
    }
}
