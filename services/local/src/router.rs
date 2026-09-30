use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};

use crate::handlers::{
    get_execution, get_stats, get_trace, health_check, ingest_events, list_function_executions,
    list_functions,
};
use crate::storage::SqliteStorage;

/// Application state shared across all request handlers.
#[derive(Clone)]
pub struct AppState {
    pub storage: SqliteStorage,
}

/// Creates the Axum router for the Local SQLite Service.
pub fn create_router(storage: SqliteStorage) -> Router {
    let state = AppState { storage };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health_check))
        .route("/v1/events", post(ingest_events))
        .route("/v1/functions", get(list_functions))
        .route("/v1/functions/:id/executions", get(list_function_executions))
        .route("/v1/executions/:id", get(get_execution))
        .route("/v1/traces/:trace_id", get(get_trace))
        .route("/v1/stats", get(get_stats))
        .layer(cors)
        .with_state(state)
}
