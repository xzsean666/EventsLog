use axum::body::Body;
use axum::http::{Request, StatusCode};
use eventslog_local::{create_router, SqliteStorage};
use eventslog_protocol::{
    Event, EventPayload, EventType, ExecutionStatus, FunctionExecution, FunctionIdentity,
};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

fn build_test_event(
    event_id: &str,
    trace_id: &str,
    span_id: &str,
    parent_span_id: Option<&str>,
    service: &str,
    module: &str,
    func: &str,
    status: ExecutionStatus,
    duration_ms: f64,
) -> Event {
    let execution = FunctionExecution {
        function: FunctionIdentity::new(module, func),
        input_payload: Some(serde_json::json!({"arg": 123})),
        output_payload: Some(serde_json::json!({"res": "ok"})),
        duration_nanos: (duration_ms * 1_000_000.0) as u64,
        status,
        error: None,
        attributes: None,
    };

    Event {
        event_id: uuid::Uuid::parse_str(event_id).unwrap_or_else(|_| uuid::Uuid::new_v4()),
        trace_id: trace_id.to_string(),
        span_id: span_id.to_string(),
        parent_span_id: parent_span_id.map(|s| s.to_string()),
        service_name: service.to_string(),
        environment: "local-dev".to_string(),
        event_type: EventType::FunctionExecution,
        timestamp: chrono::Utc::now(),
        payload: EventPayload::FunctionExecution(execution),
    }
}

#[tokio::test]
async fn test_local_health_endpoint() {
    let storage = SqliteStorage::open_in_memory().unwrap();
    let app = create_router(storage);

    let req = Request::builder()
        .uri("/health")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "ok");
    assert_eq!(json["service"], "eventslog-local");
    assert_eq!(json["storage"], "sqlite");
}

#[tokio::test]
async fn test_local_cors_support() {
    let storage = SqliteStorage::open_in_memory().unwrap();
    let app = create_router(storage);

    let req = Request::builder()
        .uri("/health")
        .method("GET")
        .header("Origin", "http://localhost:3000")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(
        res.headers()
            .get("access-control-allow-origin")
            .unwrap()
            .to_str()
            .unwrap(),
        "*"
    );
}

#[tokio::test]
async fn test_empty_ingest_rejection() {
    let storage = SqliteStorage::open_in_memory().unwrap();
    let app = create_router(storage);

    let req = Request::builder()
        .uri("/v1/events")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(r#"{"events": []}"#))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_batch_endpoint_ingest() {
    let storage = SqliteStorage::open_in_memory().unwrap();
    let app = create_router(storage);

    let event = build_test_event(
        "00000000-0000-0000-0000-000000000009",
        "trace-109",
        "span-109",
        None,
        "mobile-service",
        "checkout",
        "pay",
        ExecutionStatus::Success,
        45.0,
    );

    let payload = serde_json::json!({
        "events": [event]
    });

    let req = Request::builder()
        .uri("/v1/events/batch")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_string(&payload).unwrap()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::ACCEPTED);
}

#[tokio::test]
async fn test_bare_array_and_single_event_ingest() {
    let storage = SqliteStorage::open_in_memory().unwrap();
    let app = create_router(storage);

    let event1 = build_test_event(
        "00000000-0000-0000-0000-000000000010",
        "trace-200",
        "span-200",
        None,
        "auth-service",
        "auth",
        "login",
        ExecutionStatus::Success,
        12.0,
    );

    // Bare array: [...]
    let req_array = Request::builder()
        .uri("/v1/events")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_string(&vec![event1]).unwrap()))
        .unwrap();

    let res_array = app.clone().oneshot(req_array).await.unwrap();
    assert_eq!(res_array.status(), StatusCode::ACCEPTED);

    // Single event object: {...}
    let event2 = build_test_event(
        "00000000-0000-0000-0000-000000000011",
        "trace-201",
        "span-201",
        None,
        "auth-service",
        "auth",
        "logout",
        ExecutionStatus::Success,
        8.0,
    );

    let req_single = Request::builder()
        .uri("/v1/events")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(serde_json::to_string(&event2).unwrap()))
        .unwrap();

    let res_single = app.clone().oneshot(req_single).await.unwrap();
    assert_eq!(res_single.status(), StatusCode::ACCEPTED);
}

#[tokio::test]
async fn test_execution_not_found_returns_404() {
    let storage = SqliteStorage::open_in_memory().unwrap();
    let app = create_router(storage);

    let req = Request::builder()
        .uri("/v1/executions/non-existent-id")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_local_full_lifecycle_ingest_and_query() {
    let storage = SqliteStorage::open_in_memory().unwrap();
    let app = create_router(storage);

    // 1. Ingest batch of events (1 root span, 1 child span, 1 error span)
    let event1 = build_test_event(
        "00000000-0000-0000-0000-000000000001",
        "trace-100",
        "span-root",
        None,
        "order-service",
        "orders",
        "create_order",
        ExecutionStatus::Success,
        45.0,
    );

    let event2 = build_test_event(
        "00000000-0000-0000-0000-000000000002",
        "trace-100",
        "span-child-1",
        Some("span-root"),
        "payment-service",
        "payments",
        "charge_card",
        ExecutionStatus::Success,
        20.0,
    );

    let event3 = build_test_event(
        "00000000-0000-0000-0000-000000000003",
        "trace-101",
        "span-err",
        None,
        "order-service",
        "orders",
        "create_order",
        ExecutionStatus::Error,
        15.0,
    );

    let batch_json = serde_json::to_string(&serde_json::json!({
        "events": [event1, event2, event3]
    }))
    .unwrap();

    let req_ingest = Request::builder()
        .uri("/v1/events")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(batch_json))
        .unwrap();

    let res_ingest = app.clone().oneshot(req_ingest).await.unwrap();
    assert_eq!(res_ingest.status(), StatusCode::ACCEPTED);

    // 2. Query function list
    let req_fns = Request::builder()
        .uri("/v1/functions")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res_fns = app.clone().oneshot(req_fns).await.unwrap();
    assert_eq!(res_fns.status(), StatusCode::OK);
    let fns_body: Value = serde_json::from_slice(
        &res_fns.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();

    assert_eq!(fns_body["count"], 2); // order-service:orders:create_order & payment-service:payments:charge_card
    let functions = fns_body["functions"].as_array().unwrap();
    let order_fn = functions
        .iter()
        .find(|f| f["function_name"] == "create_order")
        .expect("create_order function summary must exist");
    assert_eq!(order_fn["call_count"], 2);
    assert_eq!(order_fn["error_count"], 1);
    assert_eq!(order_fn["total_executions"], 2);
    assert_eq!(order_fn["total_errors"], 1);

    // 2.1 Test Search filter
    let req_search = Request::builder()
        .uri("/v1/functions?search=charge")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res_search = app.clone().oneshot(req_search).await.unwrap();
    assert_eq!(res_search.status(), StatusCode::OK);
    let search_body: Value = serde_json::from_slice(
        &res_search.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(search_body["count"], 1);
    assert_eq!(search_body["functions"][0]["function_name"], "charge_card");

    // 3. Query executions for create_order
    let req_execs = Request::builder()
        .uri("/v1/functions/order-service:orders:create_order/executions")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res_execs = app.clone().oneshot(req_execs).await.unwrap();
    assert_eq!(res_execs.status(), StatusCode::OK);
    let execs_body: Value = serde_json::from_slice(
        &res_execs.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(execs_body["count"], 2);

    // 4. Query single execution by ID
    let req_exec = Request::builder()
        .uri("/v1/executions/00000000-0000-0000-0000-000000000001")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res_exec = app.clone().oneshot(req_exec).await.unwrap();
    assert_eq!(res_exec.status(), StatusCode::OK);
    let exec_body: Value = serde_json::from_slice(
        &res_exec.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(exec_body["execution"]["span_id"], "span-root");
    assert_eq!(exec_body["execution"]["duration_ms"], 45.0);

    // 5. Query trace tree for trace-100
    let req_trace = Request::builder()
        .uri("/v1/traces/trace-100")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res_trace = app.clone().oneshot(req_trace).await.unwrap();
    assert_eq!(res_trace.status(), StatusCode::OK);
    let trace_body: Value = serde_json::from_slice(
        &res_trace.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(trace_body["trace"]["trace_id"], "trace-100");
    assert_eq!(trace_body["trace"]["total_spans"], 2);
    let roots = trace_body["trace"]["roots"].as_array().unwrap();
    assert_eq!(roots.len(), 1);
    assert_eq!(roots[0]["span_id"], "span-root");
    assert_eq!(roots[0]["children"].as_array().unwrap().len(), 1);
    assert_eq!(
        roots[0]["children"].as_array().unwrap()[0]["span_id"],
        "span-child-1"
    );

    // 6. Query platform stats
    let req_stats = Request::builder()
        .uri("/v1/stats")
        .method("GET")
        .body(Body::empty())
        .unwrap();

    let res_stats = app.clone().oneshot(req_stats).await.unwrap();
    assert_eq!(res_stats.status(), StatusCode::OK);
    let stats_body: Value = serde_json::from_slice(
        &res_stats.into_body().collect().await.unwrap().to_bytes(),
    )
    .unwrap();
    assert_eq!(stats_body["stats"]["total_executions"], 3);
    assert_eq!(stats_body["stats"]["total_errors"], 1);
    assert!((stats_body["stats"]["error_rate"].as_f64().unwrap() - 0.333).abs() < 0.01);
}
