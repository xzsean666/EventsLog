use axum::extract::{Query, State};
use axum::Json;
use eventslog_common::ApiError;
use serde::{Deserialize, Serialize};

use crate::router::AppState;
use crate::storage::client::escape_sql_string;

#[derive(Debug, Clone, Deserialize)]
pub struct StatsQuery {
    pub service_name: Option<String>,
    pub environment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StatsResponse {
    pub total_executions: u64,
    pub total_errors: u64,
    pub error_rate: f64,
    pub p50_duration_ms: f64,
    pub p95_duration_ms: f64,
    pub p99_duration_ms: f64,
}

#[derive(Debug, Clone, Deserialize)]
struct RawStatsRow {
    #[serde(default)]
    total_executions: u64,
    #[serde(default)]
    total_errors: u64,
    #[serde(default)]
    p50_duration_ms: f64,
    #[serde(default)]
    p95_duration_ms: f64,
    #[serde(default)]
    p99_duration_ms: f64,
}

/// Handler for `GET /v1/stats`.
pub async fn get_stats(
    State(state): State<AppState>,
    Query(query): Query<StatsQuery>,
) -> Result<Json<StatsResponse>, ApiError> {
    let mut conditions = vec!["1 = 1".to_string()];

    if let Some(ref svc) = query.service_name {
        if !svc.trim().is_empty() {
            conditions.push(format!("service_name = '{}'", escape_sql_string(svc.trim())));
        }
    }
    if let Some(ref env) = query.environment {
        if !env.trim().is_empty() {
            conditions.push(format!("environment = '{}'", escape_sql_string(env.trim())));
        }
    }

    let where_clause = conditions.join(" AND ");
    let sql = format!(
        "SELECT \
            toUInt64(count()) AS total_executions, \
            toUInt64(countIf(status = 'error')) AS total_errors, \
            round(quantile(0.50)(duration_ms), 2) AS p50_duration_ms, \
            round(quantile(0.95)(duration_ms), 2) AS p95_duration_ms, \
            round(quantile(0.99)(duration_ms), 2) AS p99_duration_ms \
        FROM eventslog.function_executions \
        WHERE {where_clause} \
        FORMAT JSONEachRow"
    );

    let rows: Vec<RawStatsRow> = state
        .storage
        .execute_query(&sql)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to retrieve stats: {e}")))?;

    let raw = rows.into_iter().next().unwrap_or(RawStatsRow {
        total_executions: 0,
        total_errors: 0,
        p50_duration_ms: 0.0,
        p95_duration_ms: 0.0,
        p99_duration_ms: 0.0,
    });

    let error_rate = if raw.total_executions > 0 {
        ((raw.total_errors as f64 / raw.total_executions as f64) * 1000.0).round() / 1000.0
    } else {
        0.0
    };

    Ok(Json(StatsResponse {
        total_executions: raw.total_executions,
        total_errors: raw.total_errors,
        error_rate,
        p50_duration_ms: raw.p50_duration_ms,
        p95_duration_ms: raw.p95_duration_ms,
        p99_duration_ms: raw.p99_duration_ms,
    }))
}
