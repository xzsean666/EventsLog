use axum::body::Body;
use axum::http::{Request, StatusCode};
use eventslog_config::ServerConfig;
use eventslog_ingestion::create_router;
use http_body_util::BodyExt;
use tower::ServiceExt;

#[tokio::test]
async fn test_health_check_endpoint() {
    let app = create_router(ServerConfig::default());

    let request = Request::builder()
        .uri("/health")
        .method("GET")
        .body(Body::empty())
        .expect("build request");

    let response = app.oneshot(request).await.expect("execute request");

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).expect("parse json response");

    assert_eq!(json["status"], "ok");
    assert_eq!(json["service"], "ingestion");
    assert_eq!(json["version"], eventslog_protocol::PROTOCOL_VERSION);
}
