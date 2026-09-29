use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::routing::post;
use axum::Router;
use eventslog_config::ServerConfig;
use eventslog_query::{create_router_with_storage, ClickHouseStorageClient};
use http_body_util::BodyExt;
use std::sync::Arc;
use tower::ServiceExt;

async fn setup_mock_query_app() -> (axum::Router, tokio::task::JoinHandle<()>) {
    let mock_clickhouse = Router::new().route(
        "/",
        post(|body: String| async move {
            if body.contains("quantile") || body.contains("p50_duration_ms") {
                // Stats query
                r#"{"total_executions":100,"total_errors":5,"p50_duration_ms":10.5,"p95_duration_ms":45.2,"p99_duration_ms":90.0}"#.to_string()
            } else if body.contains("GROUP BY") {
                // Functions query
                r#"{"service_name":"order-svc","module_name":"orders","function_name":"place_order","call_count":50,"error_count":1,"avg_duration_ms":22.4,"last_seen":"2026-09-29T10:00:00Z"}"#.to_string()
            } else if body.contains("WHERE trace_id = 'trace-tree-1'") {
                // Trace query
                let row1 = r#"{"event_id":"e1","trace_id":"trace-tree-1","span_id":"s1","parent_span_id":"","service_name":"web","environment":"prod","module_name":"web","class_name":"","function_name":"handle_req","file_path":"","line_number":0,"input_json":"","output_json":"","duration_ms":50.0,"duration_nanos":50000000,"status":"success","error_type":"","error_message":"","error_stack":"","attributes_json":"","timestamp":"2026-09-29T10:00:00Z"}"#;
                let row2 = r#"{"event_id":"e2","trace_id":"trace-tree-1","span_id":"s2","parent_span_id":"s1","service_name":"db","environment":"prod","module_name":"db","class_name":"","function_name":"query_user","file_path":"","line_number":0,"input_json":"","output_json":"","duration_ms":20.0,"duration_nanos":20000000,"status":"success","error_type":"","error_message":"","error_stack":"","attributes_json":"","timestamp":"2026-09-29T10:00:01Z"}"#;
                format!("{row1}\n{row2}\n")
            } else if body.contains("WHERE event_id = 'e1' OR span_id = 'e1'") {
                // Single execution
                r#"{"event_id":"e1","trace_id":"trace-tree-1","span_id":"s1","parent_span_id":"","service_name":"web","environment":"prod","module_name":"web","class_name":"","function_name":"handle_req","file_path":"","line_number":0,"input_json":"{\"user\":1}","output_json":"{\"status\":200}","duration_ms":50.0,"duration_nanos":50000000,"status":"success","error_type":"","error_message":"","error_stack":"","attributes_json":"","timestamp":"2026-09-29T10:00:00Z"}"#.to_string()
            } else {
                // Generic executions query
                let row = r#"{"event_id":"e1","trace_id":"trace-tree-1","span_id":"s1","parent_span_id":"","service_name":"web","environment":"prod","module_name":"web","class_name":"","function_name":"handle_req","file_path":"","line_number":0,"input_json":"","output_json":"","duration_ms":50.0,"duration_nanos":50000000,"status":"success","error_type":"","error_message":"","error_stack":"","attributes_json":"","timestamp":"2026-09-29T10:00:00Z"}"#;
                format!("{row}\n")
            }
        }),
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let mock_handle = tokio::spawn(async move {
        axum::serve(listener, mock_clickhouse).await.unwrap();
    });

    let storage = Arc::new(ClickHouseStorageClient::new(&format!(
        "http://127.0.0.1:{port}"
    )));
    let app = create_router_with_storage(ServerConfig::default(), storage);

    (app, mock_handle)
}

#[tokio::test]
async fn test_list_functions_endpoint() {
    let (app, handle) = setup_mock_query_app().await;

    let req = Request::builder()
        .uri("/v1/functions")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["count"], 1);
    assert_eq!(json["functions"][0]["function_name"], "place_order");

    handle.abort();
}

#[tokio::test]
async fn test_list_function_executions_endpoint() {
    let (app, handle) = setup_mock_query_app().await;

    let req = Request::builder()
        .uri("/v1/functions/place_order/executions?limit=10")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["function_name"], "place_order");
    assert_eq!(json["count"], 1);

    handle.abort();
}

#[tokio::test]
async fn test_get_execution_endpoint() {
    let (app, handle) = setup_mock_query_app().await;

    let req = Request::builder()
        .uri("/v1/executions/e1")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["event_id"], "e1");
    assert_eq!(json["function_name"], "handle_req");

    handle.abort();
}

#[tokio::test]
async fn test_get_trace_tree_endpoint() {
    let (app, handle) = setup_mock_query_app().await;

    let req = Request::builder()
        .uri("/v1/traces/trace-tree-1")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["trace_id"], "trace-tree-1");
    assert_eq!(json["total_spans"], 2);
    assert_eq!(json["roots"].as_array().unwrap().len(), 1);
    assert_eq!(json["roots"][0]["execution"]["function_name"], "handle_req");
    assert_eq!(json["roots"][0]["children"].as_array().unwrap().len(), 1);
    assert_eq!(
        json["roots"][0]["children"][0]["execution"]["function_name"],
        "query_user"
    );

    handle.abort();
}

#[tokio::test]
async fn test_get_stats_endpoint() {
    let (app, handle) = setup_mock_query_app().await;

    let req = Request::builder()
        .uri("/v1/stats")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["total_executions"], 100);
    assert_eq!(json["total_errors"], 5);
    assert_eq!(json["error_rate"], 0.05);
    assert_eq!(json["p50_duration_ms"], 10.5);

    handle.abort();
}

#[tokio::test]
async fn test_query_api_key_auth() {
    let mock_clickhouse = Router::new().route(
        "/",
        post(|_body: String| async move {
            r#"{"total_executions":10,"total_errors":0,"p50_duration_ms":1.0,"p95_duration_ms":2.0,"p99_duration_ms":3.0}"#.to_string()
        }),
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let mock_handle = tokio::spawn(async move {
        axum::serve(listener, mock_clickhouse).await.unwrap();
    });

    let storage = Arc::new(ClickHouseStorageClient::new(&format!("http://127.0.0.1:{port}")));
    let config = ServerConfig {
        api_key: Some("query-secret-pass".to_string()),
        ..Default::default()
    };
    let app = create_router_with_storage(config, storage);

    // 1. Unauthenticated request -> 401
    let req_unauth = Request::builder()
        .uri("/v1/stats")
        .method("GET")
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req_unauth).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

    // 2. Invalid key -> 401
    let req_invalid = Request::builder()
        .uri("/v1/stats")
        .method("GET")
        .header("x-api-key", "wrong-key")
        .body(Body::empty())
        .unwrap();
    let res = app.clone().oneshot(req_invalid).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

    // 3. Valid key -> 200
    let req_valid = Request::builder()
        .uri("/v1/stats")
        .method("GET")
        .header("x-api-key", "query-secret-pass")
        .body(Body::empty())
        .unwrap();
    let res = app.oneshot(req_valid).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    mock_handle.abort();
}
