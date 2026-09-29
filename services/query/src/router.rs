use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use eventslog_config::ServerConfig;
use serde_json::json;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use crate::handlers::{
    get_execution, get_stats, get_trace, list_function_executions, list_functions,
};
use crate::storage::ClickHouseStorageClient;

/// Query service application state.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<ServerConfig>,
    pub storage: Arc<ClickHouseStorageClient>,
}

impl axum::extract::FromRef<AppState> for Arc<ServerConfig> {
    fn from_ref(state: &AppState) -> Self {
        state.config.clone()
    }
}

impl axum::extract::FromRef<AppState> for Arc<ClickHouseStorageClient> {
    fn from_ref(state: &AppState) -> Self {
        state.storage.clone()
    }
}

/// Handler for the `/health` endpoint.
pub async fn health_check() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "service": "query",
        "version": eventslog_protocol::PROTOCOL_VERSION
    }))
}

/// Creates the base Axum router for the Query Service with default ClickHouse client.
pub fn create_router(config: ServerConfig) -> Router {
    let storage = Arc::new(ClickHouseStorageClient::new(&config.clickhouse_url));
    create_router_with_storage(config, storage)
}

/// Creates the Axum router for the Query Service with a specified ClickHouse storage client.
pub fn create_router_with_storage(
    config: ServerConfig,
    storage: Arc<ClickHouseStorageClient>,
) -> Router {
    let state = AppState {
        config: Arc::new(config),
        storage,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health_check))
        .route("/v1/functions", get(list_functions))
        .route("/v1/functions/:id/executions", get(list_function_executions))
        .route("/v1/executions/:id", get(get_execution))
        .route("/v1/traces/:trace_id", get(get_trace))
        .route("/v1/stats", get(get_stats))
        .layer(cors)
        .with_state(state)
}
