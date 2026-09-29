use axum::extract::{Path, State};
use axum::Json;
use eventslog_common::ApiError;
use eventslog_schema::ExecutionRow;

use serde::{Deserialize, Serialize};

use crate::router::AppState;
use crate::storage::client::escape_sql_string;

/// Wrapper providing both nested `{ execution: ... }` and flat fields for client compatibility.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecutionEnvelope {
    pub execution: ExecutionRow,
    #[serde(flatten)]
    pub direct: ExecutionRow,
}

/// Handler for `GET /v1/executions/{id}`.
pub async fn get_execution(
    State(state): State<AppState>,
    _auth: crate::auth::AuthContext,
    Path(id): Path<String>,
) -> Result<Json<ExecutionEnvelope>, ApiError> {
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
        Some(row) => Ok(Json(ExecutionEnvelope {
            execution: row.clone(),
            direct: row,
        })),
        None => Err(ApiError::NotFound(format!("Execution '{id}' not found"))),
    }
}
