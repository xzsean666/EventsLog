# Ingestion Service

Stateless event ingestion HTTP service built with Axum / Tokio in Rust.
Receives event batches from SDKs, validates API keys and schemas, enqueues events to a bounded ring buffer, and flushes to ClickHouse.
