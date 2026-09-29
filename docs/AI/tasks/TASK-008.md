# TASK-008: Ingestion Service HTTP Skeleton & Health Check

## Objective
Create the standalone Rust HTTP service binary for `services/ingestion` with Axum, implementing graceful shutdown, structured logging, configuration loading, and a `/health` endpoint.

## Scope
- Initialize `services/ingestion/Cargo.toml` with `axum`, `tokio`, `tracing`, `eventslog-protocol`, `eventslog-config`, `eventslog-common`.
- Add `services/ingestion` to root `Cargo.toml` `members`.
- Implement `main.rs` with Tokio runtime and signal handling for SIGINT/SIGTERM graceful shutdown.
- Implement HTTP router in `services/ingestion/src/router.rs` exposing:
  - `GET /health` returning `{ "status": "ok", "service": "ingestion", "version": "..." }`.
- Add integration test spinning up the server and querying `/health`.

## Allowed Files
- `Cargo.toml`
- `services/ingestion/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-008.md`

## Dependencies
- TASK-003
- TASK-005

## Inputs and Outputs
- **Inputs**: Axum framework configuration and server config.
- **Outputs**: Runnable Rust binary `services/ingestion` serving HTTP requests.

## Acceptance Criteria
1. `services/ingestion` compiles cleanly within the Cargo workspace.
2. `GET /health` returns HTTP 200 OK with JSON status payload.
3. Server shuts down cleanly on SIGTERM/Ctrl-C.
4. `cargo test -p eventslog-ingestion` passes.

## Verification Commands
- `cargo check -p eventslog-ingestion`
- `cargo test -p eventslog-ingestion`

## Risks and Assumptions
- Use random/ephemeral port in automated integration tests to avoid port conflicts.

## Status
DONE
