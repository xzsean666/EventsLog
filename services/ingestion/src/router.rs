use axum::extract::DefaultBodyLimit;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use eventslog_config::ServerConfig;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

use tower_http::cors::{Any, CorsLayer};

use crate::buffer::{BatchBuffer, BatchBufferConfig, DropPolicy};
use crate::handlers::ingest::ingest_events;

/// App state shared with request handlers and extractors.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<ServerConfig>,
    pub buffer: Arc<BatchBuffer>,
}

impl axum::extract::FromRef<AppState> for Arc<ServerConfig> {
    fn from_ref(state: &AppState) -> Self {
        state.config.clone()
    }
}

impl axum::extract::FromRef<AppState> for Arc<BatchBuffer> {
    fn from_ref(state: &AppState) -> Self {
        state.buffer.clone()
    }
}

/// Handler for the `/health` endpoint.
pub async fn health_check() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "service": "ingestion",
        "version": eventslog_protocol::PROTOCOL_VERSION
    }))
}

/// Creates the base Axum router for the Ingestion Service with default buffer.
pub fn create_router(config: ServerConfig) -> Router {
    let (sink_tx, _sink_rx) = tokio::sync::mpsc::channel(100);
    let buffer_config = BatchBufferConfig {
        max_capacity: config.buffer_size,
        batch_size: 1_000,
        flush_interval: Duration::from_millis(config.flush_interval_ms),
        drop_policy: DropPolicy::DropNewest,
    };
    let buffer = Arc::new(BatchBuffer::new(buffer_config, sink_tx));
    create_router_with_buffer(config, buffer)
}

/// Creates the Axum router for the Ingestion Service with a specified batch buffer.
pub fn create_router_with_buffer(config: ServerConfig, buffer: Arc<BatchBuffer>) -> Router {
    let state = AppState {
        config: Arc::new(config),
        buffer,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health_check))
        .route("/v1/events", post(ingest_events))
        .route("/v1/events/batch", post(ingest_events))
        .layer(cors)
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024)) // 10MB request payload limit
        .with_state(state)
}
