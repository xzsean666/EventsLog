# TASK-034: Rust Local Service with SQLite Storage Engine (`services/local`)

## Subsystem
Rust Backend Services (`services/local`, `eventslog-local`)

## Milestone
Milestone 14: Local Storage Mode (SQLite & IndexedDB)

## Status
DONE

## Verification Results
- `services/local` created and registered in workspace `Cargo.toml`.
- Embedded SQLite storage engine (`SqliteStorage`) implemented with WAL mode, auto-schema initialization, and indexed queries.
- Unified Axum router (`eventslog-local`) serves ingestion (`POST /v1/events`) and query endpoints (`GET /v1/functions`, `GET /v1/functions/:id/executions`, `GET /v1/executions/:id`, `GET /v1/traces/:trace_id`, `GET /v1/stats`, `GET /health`) with permissive CORS.
- 6 integration tests in `services/local/tests/local_service_test.rs` pass in 0.02s.
- `cargo test --workspace` passed 54/54 tests with 0 failures.
- `pnpm -r run test` passed 80/80 tests with 0 failures.

## Dependencies
- `TASK-003`: Core Protocol & Event Data Models in Rust
- `TASK-004`: Core Schema & Storage Record Models in Rust
- `TASK-005`: Shared Configuration Model in Rust
- `TASK-006`: Shared Common Utilities in Rust
- `TASK-014`: Query Service Function, Execution & Trace APIs

## Verification Criteria
- `services/local` builds cleanly and is registered as a member in the root `Cargo.toml`.
- Embedded SQLite storage engine manages table schema, execution records, and trace indices automatically without external database setup.
- Dual-role Axum HTTP server serves both Ingestion (`POST /v1/events`) and Query (`GET /v1/functions`, `GET /v1/functions/:id/executions`, `GET /v1/executions/:id`, `GET /v1/traces/:trace_id`, `GET /v1/stats`, `GET /health`) with full CORS support.
- Trace tree reconstruction aligns with `TraceResponse` and `TraceNode` contract from `eventslog_query`.
- Unit and integration tests verify SQLite schema creation, batched event ingestion, aggregation queries, and trace tree reconstruction.
- `cargo test --workspace` passes cleanly with zero failures.

## Problem Statement
Deploying ClickHouse and managing multiple microservices (`eventslog-ingestion` and `eventslog-query`) requires Docker, significant memory overhead, and complex local orchestration. For local development, testing, CLI usage, and standalone debugging, developers need an all-in-one, zero-dependency local service that persists data to a single SQLite database file (`eventslog.db`) while providing 100% API compatibility with existing SDKs and the Web Dashboard.

## Scope of Work
1. **Crate Setup**:
   - Create `services/local` crate with binary `eventslog-local` and library `eventslog_local`.
   - Add `services/local` to root `Cargo.toml` members.
   - Add `rusqlite` (with bundled, chrono, serde_json features) to workspace dependencies.
2. **SQLite Storage Engine**:
   - Define `SqliteStorage` managing an embedded SQLite connection pool or thread-safe connection.
   - Automatically initialize SQLite tables (`executions`) and indices on startup.
   - Implement batched insertion of `ExecutionRow`s mapped from incoming `Event`s.
   - Implement function summary aggregation (`list_functions`) with search, service, environment filters.
   - Implement execution list filtering (`list_executions`).
   - Implement single execution lookup (`get_execution`).
   - Implement trace span retrieval and tree reconstruction (`get_trace`).
   - Implement platform summary statistics (`get_stats`).
3. **Unified Axum Router & Handlers**:
   - Ingestion: `POST /v1/events` (supports both `{ events: [...] }` and `[...]`).
   - Query: `GET /health`, `GET /v1/functions`, `GET /v1/functions/:id/executions`, `GET /v1/executions/:id`, `GET /v1/traces/:trace_id`, `GET /v1/stats`.
   - Enable CORS (`tower-http`) so Web Dashboard or external tools can query the local server seamlessly.
4. **CLI & Environment Configuration**:
   - Support CLI arguments and environment variables for `--port` / `PORT` / `EVENTSLOG_PORT` (default 8080) and `--db` / `EVENTSLOG_DB_PATH` (default `./eventslog.db` or in-memory `:memory:` for testing).
   - Graceful shutdown on SIGINT / SIGTERM.
5. **Testing**:
   - In-memory SQLite tests covering batch ingestion, function aggregation, execution filtering, trace tree assembly, and API endpoints.
