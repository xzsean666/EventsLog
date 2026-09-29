use axum::extract::{Path, Query, State};
use axum::Json;
use eventslog_common::ApiError;
use eventslog_schema::ExecutionRow;
use serde::{Deserialize, Serialize};

use crate::router::AppState;
use crate::storage::{ExecutionFilter, FunctionFilter, FunctionSummary};

#[derive(Debug, Clone, Deserialize)]
pub struct FunctionsQuery {
    pub service_name: Option<String>,
    pub environment: Option<String>,
    pub search: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExecutionsPaginationQuery {
    pub service_name: Option<String>,
    pub environment: Option<String>,
    pub status: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionsResponse {
    pub functions: Vec<FunctionSummary>,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionExecutionsResponse {
    pub function_name: String,
    pub executions: Vec<ExecutionRow>,
    pub count: usize,
}

/// Handler for `GET /v1/functions`.
pub async fn list_functions(
    State(state): State<AppState>,
    Query(query): Query<FunctionsQuery>,
) -> Result<Json<FunctionsResponse>, ApiError> {
    let filter = FunctionFilter {
        service_name: query.service_name,
        environment: query.environment,
        search: query.search,
        limit: query.limit,
    };

    let functions = state
        .storage
        .query_functions(&filter)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to list functions: {e}")))?;

    let count = functions.len();
    Ok(Json(FunctionsResponse { functions, count }))
}

/// Handler for `GET /v1/functions/{id}/executions`.
pub async fn list_function_executions(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<ExecutionsPaginationQuery>,
) -> Result<Json<FunctionExecutionsResponse>, ApiError> {
    let filter = ExecutionFilter {
        service_name: query.service_name,
        environment: query.environment,
        function_name: Some(id.clone()),
        status: query.status,
        limit: query.limit,
        offset: query.offset,
        ..Default::default()
    };

    let executions = state
        .storage
        .query_executions(&filter)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to list executions: {e}")))?;

    let count = executions.len();
    Ok(Json(FunctionExecutionsResponse {
        function_name: id,
        executions,
        count,
    }))
}
