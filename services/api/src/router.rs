use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use eventslog_common::ApiError;
use eventslog_config::ServerConfig;
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};

use crate::models::{CreateApiKeyRequest, CreateProjectRequest};
use crate::state::AppState;

pub async fn health_check() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "service": "api",
        "version": eventslog_protocol::PROTOCOL_VERSION
    }))
}

pub async fn create_project_handler(
    State(state): State<AppState>,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if payload.name.trim().is_empty() {
        return Err(ApiError::BadRequest("Project name cannot be empty".to_string()));
    }

    let project = state.create_project(payload.name, payload.description).await;
    Ok((StatusCode::CREATED, Json(project)))
}

pub async fn list_projects_handler(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, ApiError> {
    let projects = state.list_projects().await;
    Ok(Json(json!({
        "projects": projects,
        "count": projects.len()
    })))
}

pub async fn create_api_key_handler(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Json(payload): Json<CreateApiKeyRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if payload.name.trim().is_empty() {
        return Err(ApiError::BadRequest("Key name cannot be empty".to_string()));
    }

    match state.create_api_key(&project_id, payload.name).await {
        Some(key) => Ok((StatusCode::CREATED, Json(key))),
        None => Err(ApiError::NotFound(format!("Project '{project_id}' not found"))),
    }
}

pub async fn list_api_keys_handler(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    if state.get_project(&project_id).await.is_none() {
        return Err(ApiError::NotFound(format!("Project '{project_id}' not found")));
    }

    let keys = state.list_api_keys(&project_id).await;
    Ok(Json(json!({
        "keys": keys,
        "count": keys.len()
    })))
}

pub fn create_router(config: ServerConfig) -> Router {
    let state = AppState::new(config);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health_check))
        .route("/v1/projects", post(create_project_handler).get(list_projects_handler))
        .route(
            "/v1/projects/:project_id/keys",
            post(create_api_key_handler).get(list_api_keys_handler),
        )
        .layer(cors)
        .with_state(state)
}
