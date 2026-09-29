use axum::extract::rejection::JsonRejection;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use eventslog_common::ApiError;
use eventslog_protocol::{BatchEventPayload, Event};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthContext;
use crate::router::AppState;

/// Maximum number of events allowed in a single ingestion batch.
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
    /// Extracts a flat vector of events from the received payload.
    pub fn into_events(self) -> Vec<Event> {
        match self {
            Self::Batch(batch) => batch.events,
            Self::Array(events) => events,
            Self::Single(event) => vec![event],
        }
    }
}

/// Handler for `POST /v1/events` endpoint.
pub async fn ingest_events(
    State(state): State<AppState>,
    _auth: AuthContext,
    payload_result: Result<Json<IngestPayload>, JsonRejection>,
) -> Result<impl IntoResponse, ApiError> {
    let Json(payload) = payload_result.map_err(|rejection| {
        ApiError::BadRequest(format!("Invalid JSON payload: {}", rejection.body_text()))
    })?;

    let events = payload.into_events();

    if events.is_empty() {
        return Err(ApiError::BadRequest(
            "Event payload cannot be empty".to_string(),
        ));
    }

    if events.len() > MAX_BATCH_EVENTS {
        return Err(ApiError::PayloadTooLarge(format!(
            "Batch size {} exceeds maximum allowed limit of {} events",
            events.len(),
            MAX_BATCH_EVENTS
        )));
    }

    let (accepted, dropped) = state.buffer.enqueue_batch(events);
    let ingest_id = Uuid::new_v4().to_string();

    let response_body = json!({
        "status": "accepted",
        "count": accepted,
        "dropped": dropped,
        "ingest_id": ingest_id
    });

    Ok((StatusCode::ACCEPTED, Json(response_body)))
}
