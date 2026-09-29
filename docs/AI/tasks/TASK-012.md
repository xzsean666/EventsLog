# TASK-012: Query Service HTTP Skeleton & Routes

## Objective
Create the standalone Rust HTTP service binary for `services/query` using Axum, configuring router skeletons, CORS for the dashboard frontend, and a `/health` endpoint.

## Scope
- Initialize `services/query/Cargo.toml` with `axum`, `tokio`, `tower-http` (CORS), `eventslog-protocol`, `eventslog-config`, `eventslog-common`.
- Add `services/query` to root `Cargo.toml` `members`.
- Implement `main.rs` and router in `services/query/src/router.rs`:
  - `GET /health` returning `{ "status": "ok", "service": "query" }`.
  - CORS middleware allowing dashboard requests.
- Integration tests verifying health endpoint and CORS headers.

## Allowed Files
- `Cargo.toml`
- `services/query/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-012.md`

## Dependencies
- TASK-003
- TASK-005

## Inputs and Outputs
- **Inputs**: Axum router configuration.
- **Outputs**: Query service HTTP server binary.

## Acceptance Criteria
1. `services/query` compiles cleanly in Cargo workspace.
2. `GET /health` returns HTTP 200 OK.
3. CORS headers are returned properly for web dashboard origin.
4. `cargo test -p eventslog-query` passes.

## Verification Commands
- `cargo check -p eventslog-query`
- `cargo test -p eventslog-query`

## Risks and Assumptions
- Use configurable port to avoid collision with Ingestion Service (e.g. Ingestion on 8080, Query on 8081).

## Status
DONE
