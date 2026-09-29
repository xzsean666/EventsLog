# TASK-006: Shared Common Utilities in Rust

## Objective
Implement reusable backend utilities in `crates/common`, including structured logging initialization, custom error types, environment variable helpers, and standard HTTP response wrappers.

## Scope
- Initialize `crates/common/Cargo.toml` with `tracing`, `tracing-subscriber`, `thiserror`, and `axum`.
- Implement `init_tracing` subscriber helper in `crates/common/src/logging.rs` supporting JSON and compact console formatting.
- Implement error response formats and HTTP status mapping in `crates/common/src/error.rs`.
- Add unit tests for error serializations and time utilities.

## Allowed Files
- `/ssd0/git/EventsLog/Cargo.toml`
- `/ssd0/git/EventsLog/crates/common/Cargo.toml`
- `/ssd0/git/EventsLog/crates/common/src/lib.rs`
- `/ssd0/git/EventsLog/crates/common/src/logging.rs`
- `/ssd0/git/EventsLog/crates/common/src/error.rs`
- `/ssd0/git/EventsLog/docs/AI/SESSION_STATE.md`
- `/ssd0/git/EventsLog/docs/AI/TASK_INDEX.md`
- `/ssd0/git/EventsLog/docs/AI/tasks/TASK-006.md`

## Dependencies
- TASK-003

## Inputs and Outputs
- **Inputs**: Backend observability and error-handling requirements.
- **Outputs**: Shared `eventslog-common` crate with tracing helpers and unified error responses.

## Acceptance Criteria
1. `eventslog-common` compiles and links in Cargo workspace.
2. Standard API error responses match `{ "error": { "code": "...", "message": "..." } }`.
3. `cargo test -p eventslog-common` passes.

## Verification Commands
- `cargo check -p eventslog-common`
- `cargo test -p eventslog-common`

## Risks and Assumptions
- Keep common crate minimal; do not introduce service-specific dependencies.

## Status
DONE
