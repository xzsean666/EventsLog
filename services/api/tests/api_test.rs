use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use eventslog_api::create_router;
use eventslog_config::ServerConfig;
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn test_api_health_endpoint() {
    let app = create_router(ServerConfig::default());

    let req = Request::builder()
        .uri("/health")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "ok");
    assert_eq!(json["service"], "api");
}

#[tokio::test]
async fn test_project_and_api_key_lifecycle() {
    let app = create_router(ServerConfig::default());

    // 1. Create project
    let create_proj_req = Request::builder()
        .uri("/v1/projects")
        .method("POST")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({
            "name": "E-Commerce Backend",
            "description": "Core checkout services"
        }).to_string()))
        .unwrap();

    let res = app.clone().oneshot(create_proj_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let project: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let project_id = project["id"].as_str().unwrap().to_string();
    assert_eq!(project["name"], "E-Commerce Backend");

    // 2. List projects
    let list_req = Request::builder()
        .uri("/v1/projects")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res = app.clone().oneshot(list_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let list_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(list_json["count"], 1);

    // 3. Create API key
    let create_key_req = Request::builder()
        .uri(format!("/v1/projects/{project_id}/keys"))
        .method("POST")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({
            "name": "Production SDK Ingest Key"
        }).to_string()))
        .unwrap();

    let res = app.clone().oneshot(create_key_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let key_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(key_json["key"].as_str().unwrap().starts_with("el_live_"));
    assert_eq!(key_json["name"], "Production SDK Ingest Key");

    // 4. List API keys
    let list_keys_req = Request::builder()
        .uri(format!("/v1/projects/{project_id}/keys"))
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res = app.clone().oneshot(list_keys_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let keys_list: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(keys_list["count"], 1);

    // 5. Try creating key for nonexistent project returns 404
    let invalid_key_req = Request::builder()
        .uri("/v1/projects/nonexistent_id/keys")
        .method("POST")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "name": "Key" }).to_string()))
        .unwrap();

    let res = app.oneshot(invalid_key_req).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}
