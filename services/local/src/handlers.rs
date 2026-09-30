use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use eventslog_common::ApiError;
use eventslog_protocol::{BatchEventPayload, Event};
use eventslog_query::{
    build_trace_tree, ExecutionEnvelope, ExecutionFilter, FunctionExecutionsResponse,
    FunctionFilter, FunctionsResponse, StatsEnvelope, StatsResponse, TraceEnvelope,
};
use eventslog_schema::ExecutionRow;
use serde::Deserialize;
use serde_json::json;

use crate::router::AppState;

pub const MAX_BATCH_EVENTS: usize = 5000;

/// Flexible input format accepting batches, bare JSON arrays, or single events.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum IngestPayload {
    /// Standard batch wrapper: `{"events": [...]}`
    Batch(BatchEventPayload),
    /// Bare JSON array of events: `[...]`
    Array(Vec<Event>),
    /// Single event object: `{...}`
    Single(Event),
}

impl IngestPayload {
    pub fn into_events(self) -> Vec<Event> {
        match self {
            Self::Batch(batch) => batch.events,
            Self::Array(events) => events,
            Self::Single(event) => vec![event],
        }
    }
}

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

#[derive(Debug, Clone, Deserialize)]
pub struct StatsQuery {
    pub service_name: Option<String>,
    pub environment: Option<String>,
}

/// Handler for `GET /health` endpoint.
pub async fn health_check() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "service": "eventslog-local",
        "storage": "sqlite",
        "version": eventslog_protocol::PROTOCOL_VERSION
    }))
}

/// Handler for `POST /v1/events` endpoint.
pub async fn ingest_events(
    State(state): State<AppState>,
    payload_result: Result<Json<IngestPayload>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Json(payload) = payload_result.map_err(|rejection| {
        ApiError::BadRequest(format!("Invalid JSON payload: {}", rejection.body_text()))
    })?;

    let events = payload.into_events();

    if events.is_empty() {
        return Err(ApiError::BadRequest("Event payload cannot be empty".to_string()));
    }

    if events.len() > MAX_BATCH_EVENTS {
        return Err(ApiError::PayloadTooLarge(format!(
            "Batch size {} exceeds maximum allowed limit of {}",
            events.len(),
            MAX_BATCH_EVENTS
        )));
    }

    let rows: Vec<ExecutionRow> = events.iter().map(ExecutionRow::from).collect();
    let count = state
        .storage
        .insert_executions(rows)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to insert executions: {e}")))?;

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "status": "accepted",
            "count": count
        })),
    ))
}

/// Handler for `GET /v1/functions`.
pub async fn list_functions(
    State(state): State<AppState>,
    Query(query): Query<FunctionsQuery>,
) -> Result<Json<FunctionsResponse>, ApiError> {
    let limit = query.limit.map(|l| l.min(1000));
    let filter = FunctionFilter {
        service_name: query.service_name,
        environment: query.environment,
        search: query.search,
        limit,
    };

    let functions = state
        .storage
        .list_functions(&filter)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to list functions: {e}")))?;

    let count = functions.len();
    Ok(Json(FunctionsResponse { functions, count }))
}

/// Handler for `GET /v1/functions/:id/executions`.
pub async fn list_function_executions(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<ExecutionsPaginationQuery>,
) -> Result<Json<FunctionExecutionsResponse>, ApiError> {
    let limit = query.limit.map(|l| l.min(1000));
    let (service_override, func_name) = if id.contains(':') {
        let parts: Vec<&str> = id.split(':').collect();
        if parts.len() >= 3 {
            (Some(parts[0].to_string()), parts[parts.len() - 1].to_string())
        } else if parts.len() == 2 {
            (None, parts[1].to_string())
        } else {
            (None, id.clone())
        }
    } else {
        (None, id.clone())
    };

    let filter = ExecutionFilter {
        service_name: query.service_name.or(service_override),
        environment: query.environment,
        function_name: Some(func_name),
        status: query.status,
        limit,
        offset: query.offset,
        ..Default::default()
    };

    let executions = state
        .storage
        .list_executions(&filter)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to list executions: {e}")))?;

    let count = executions.len();
    Ok(Json(FunctionExecutionsResponse {
        function_name: id,
        executions,
        count,
    }))
}

/// Handler for `GET /v1/executions/:id`.
pub async fn get_execution(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ExecutionEnvelope>, ApiError> {
    let row = state
        .storage
        .get_execution(id.clone())
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to get execution: {e}")))?;

    match row {
        Some(exec) => Ok(Json(ExecutionEnvelope {
            execution: exec.clone(),
            direct: exec,
        })),
        None => Err(ApiError::NotFound(format!("Execution '{id}' not found"))),
    }
}

/// Handler for `GET /v1/traces/:trace_id`.
pub async fn get_trace(
    State(state): State<AppState>,
    Path(trace_id): Path<String>,
) -> Result<Json<TraceEnvelope>, ApiError> {
    let spans = state
        .storage
        .get_trace_spans(trace_id.clone())
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to get trace spans: {e}")))?;

    let trace_tree = build_trace_tree(trace_id, spans);
    Ok(Json(TraceEnvelope {
        trace: trace_tree.clone(),
        direct: trace_tree,
    }))
}

/// Handler for `GET /v1/stats`.
pub async fn get_stats(
    State(state): State<AppState>,
    Query(query): Query<StatsQuery>,
) -> Result<Json<StatsEnvelope>, ApiError> {
    let stats: StatsResponse = state
        .storage
        .get_stats(query.service_name, query.environment)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to get stats: {e}")))?;

    Ok(Json(StatsEnvelope {
        stats: stats.clone(),
        direct: stats,
    }))
}
