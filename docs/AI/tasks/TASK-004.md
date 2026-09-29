# TASK-004: Core Schema & Storage Record Models in Rust

## Objective
Implement storage data models in `crates/schema` representing ClickHouse database rows and define bi-directional transformations between protocol events (`eventslog-protocol`) and persistent storage records.

## Scope
- Initialize `crates/schema/Cargo.toml` and configure dependencies on `eventslog-protocol`, `serde`, `chrono`, and `uuid`.
- Define ClickHouse row representation in `crates/schema/src/models.rs`:
  - `EventRow`: Flat ClickHouse storage model for raw events.
  - `ExecutionRow`: Flat ClickHouse storage model for function executions (trace_id, span_id, parent_span_id, function_name, module_name, input_json, output_json, duration_ms, status, error_message, error_stack, timestamp).
- Implement `From<&Event> for ExecutionRow` conversion routines in `crates/schema/src/convert.rs`.
- Add unit tests validating lossless row mapping.

## Allowed Files
- `/ssd0/git/EventsLog/Cargo.toml`
- `/ssd0/git/EventsLog/crates/schema/Cargo.toml`
- `/ssd0/git/EventsLog/crates/schema/src/lib.rs`
- `/ssd0/git/EventsLog/crates/schema/src/models.rs`
- `/ssd0/git/EventsLog/crates/schema/src/convert.rs`
- `/ssd0/git/EventsLog/docs/AI/SESSION_STATE.md`
- `/ssd0/git/EventsLog/docs/AI/TASK_INDEX.md`
- `/ssd0/git/EventsLog/docs/AI/tasks/TASK-004.md`

## Dependencies
- TASK-003

## Inputs and Outputs
- **Inputs**: Protocol models from `crates/protocol`.
- **Outputs**: Rust structs implementing ClickHouse table representations with converters.

## Acceptance Criteria
1. `crates/schema` compiles cleanly and links into Cargo workspace.
2. `ExecutionRow` matches ClickHouse column types.
3. Unit tests verify conversion from `Event` to `ExecutionRow`.
4. `cargo test -p eventslog-schema` passes without warnings.

## Verification Commands
- `cargo check -p eventslog-schema`
- `cargo test -p eventslog-schema`

## Risks and Assumptions
- Input/output payloads stored as JSON strings in ClickHouse String or JSON columns.

## Status
DONE
