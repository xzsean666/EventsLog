use axum::extract::{Path, State};
use axum::Json;
use eventslog_common::ApiError;
use eventslog_schema::ExecutionRow;

use crate::router::AppState;
use crate::storage::client::escape_sql_string;

/// Handler for `GET /v1/executions/{id}`.
pub async fn get_execution(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ExecutionRow>, ApiError> {
    let escaped_id = escape_sql_string(&id);
    let sql = format!(
        "SELECT * FROM eventslog.function_executions \
        WHERE event_id = '{escaped_id}' OR span_id = '{escaped_id}' \
        LIMIT 1 \
        FORMAT JSONEachRow"
    );

    let rows: Vec<ExecutionRow> = state
        .storage
        .execute_query(&sql)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to retrieve execution: {e}")))?;

    match rows.into_iter().next() {
        Some(row) => Ok(Json(row)),
        None => Err(ApiError::NotFound(format!("Execution '{id}' not found"))),
    }
}
