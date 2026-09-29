use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use eventslog_config::ServerConfig;
use eventslog_ingestion::create_router;
use eventslog_protocol::{
    BatchEventPayload, Event, ExecutionStatus, FunctionExecution, FunctionIdentity,
};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

fn test_server_config() -> ServerConfig {
    ServerConfig {
        api_key: Some("test-secret-key".to_string()),
        ..Default::default()
    }
}

fn sample_event(name: &str) -> Event {
    let exec = FunctionExecution {
        function: FunctionIdentity::new("module", name),
        input_payload: Some(json!({"param": 1})),
        output_payload: Some(json!({"result": 2})),
        duration_nanos: 1_000_000,
        status: ExecutionStatus::Success,
        error: None,
        attributes: None,
    };
    Event::new_function_execution("trace-1", "span-1", "test-service", "test", exec)
}

#[tokio::test]
async fn test_ingest_missing_auth_returns_401() {
    let app = create_router(test_server_config());

    let req = Request::builder()
        .uri("/v1/events")
        .method("POST")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"events": []}"#))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["error"]["code"], "UNAUTHORIZED");
}

#[tokio::test]
async fn test_ingest_invalid_key_returns_401() {
    let app = create_router(test_server_config());

    let req = Request::builder()
        .uri("/v1/events")
        .method("POST")
        .header("x-api-key", "wrong-key")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"events": []}"#))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_ingest_valid_batch_returns_202() {
    let app = create_router(test_server_config());

    let batch = BatchEventPayload::with_events(vec![
        sample_event("func_a"),
        sample_event("func_b"),
    ]);

    let req_body = serde_json::to_string(&batch).unwrap();

    let req = Request::builder()
        .uri("/v1/events")
        .method("POST")
        .header("x-api-key", "test-secret-key")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(req_body))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::ACCEPTED);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "accepted");
    assert_eq!(json["count"], 2);
    assert!(json["ingest_id"].is_string());
}

#[tokio::test]
async fn test_ingest_malformed_json_returns_400() {
    let app = create_router(test_server_config());

    let req = Request::builder()
        .uri("/v1/events")
        .method("POST")
        .header("Authorization", "Bearer test-secret-key")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"events": [ { malformed json"#))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["error"]["code"], "BAD_REQUEST");
}

#[tokio::test]
async fn test_ingest_empty_batch_returns_400() {
    let app = create_router(test_server_config());

    let req = Request::builder()
        .uri("/v1/events")
        .method("POST")
        .header("x-api-key", "test-secret-key")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"events": []}"#))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["error"]["code"], "BAD_REQUEST");
}

#[tokio::test]
async fn test_ingest_bare_array_returns_202() {
    let app = create_router(test_server_config());

    let events = vec![sample_event("func_one")];
    let req_body = serde_json::to_string(&events).unwrap();

    let req = Request::builder()
        .uri("/v1/events")
        .method("POST")
        .header("x-api-key", "test-secret-key")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(req_body))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::ACCEPTED);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["count"], 1);
}
