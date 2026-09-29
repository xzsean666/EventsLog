# TASK-011: Ingestion Service ClickHouse Batched Writer

## Objective
Implement the ClickHouse batched writer component in `services/ingestion` that drains flushed event batches from the memory buffer, converts them to ClickHouse rows (`eventslog-schema`), and executes bulk inserts into ClickHouse using optimized client query parameters (`async_insert=1`, `wait_for_async_insert=1`, `log_queries=0`) as mandated by `docs/ClickHouse-Docker-Optimization.md`.

## Scope
- Implement ClickHouse client wrapper in `services/ingestion/src/storage/clickhouse.rs`:
  - Enforce optimized connection URL / query parameters:
    `?async_insert=1&wait_for_async_insert=1&async_insert_busy_timeout_ms=200&log_queries=0`
    - `async_insert=1`: instructs ClickHouse server to aggregate small batches into memory.
    - `wait_for_async_insert=1`: synchronously waits for fsync/write confirmation before returning HTTP 200.
    - `log_queries=0`: disables `system.query_log` entry generation for telemetry ingestion inserts to prevent log amplification.
- Convert batched `Event` objects into `ExecutionRow` database records.
- Implement retry logic with exponential backoff on transient network failures.
- Unit tests with mock ClickHouse HTTP endpoints verifying query parameter injection and row conversion.

## Allowed Files
- `services/ingestion/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-011.md`

## Dependencies
- TASK-007
- TASK-010

## Inputs and Outputs
- **Inputs**: Batched event slices from the ingestion memory buffer.
- **Outputs**: Bulk insert queries dispatched to ClickHouse storage with optimized client parameters.

## Acceptance Criteria
1. ClickHouse client connection URL explicitly injects `async_insert=1`, `wait_for_async_insert=1`, `async_insert_busy_timeout_ms=200`, and `log_queries=0`.
2. ClickHouse client formats bulk inserts correctly according to `001_initial_schema.sql`.
3. Failed inserts trigger bounded retries before logging failure and dropping to prevent memory leak.
4. Unit tests pass with mock HTTP server verifying query parameters.

## Verification Commands
- `cargo test -p eventslog-ingestion storage`

## Risks and Assumptions
- Use a mock server in unit tests so tests can run without requiring a live ClickHouse instance.

## Status
DONE
