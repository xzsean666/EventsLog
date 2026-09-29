# TASK-003: Core Protocol & Event Data Models in Rust

## Objective
Implement canonical protocol models, types, and serialization schemas in `crates/protocol`. This serves as the single source of truth for all EventsLog events, function execution models, trace context, and status payloads.

## Scope
- Define core event types in `crates/protocol/src/event.rs`:
  - `Event` (top-level envelope: event_id, trace_id, span_id, parent_span_id, timestamp, service_name, environment, payload).
  - `EventType` (enum: FunctionExecution, System, Metric, Error).
- Define function execution data structures in `crates/protocol/src/function.rs`:
  - `FunctionIdentity` (module, class_name, function_name, file_path, line_number).
  - `FunctionExecution` (function, input_payload, output_payload, duration_nanos, status, error).
  - `ExecutionStatus` (enum: Success, Error, Timeout, Dropped).
- Define error structures in `crates/protocol/src/error.rs`:
  - `ExecutionError` (type_name, message, stack_trace).
- Define attribute/metadata map utilities in `crates/protocol/src/attributes.rs`.
- Implement unit tests verifying serialization and deserialization across JSON representations.

## Allowed Files
- `/ssd0/git/EventsLog/crates/protocol/Cargo.toml`
- `/ssd0/git/EventsLog/crates/protocol/src/lib.rs`
- `/ssd0/git/EventsLog/crates/protocol/src/event.rs`
- `/ssd0/git/EventsLog/crates/protocol/src/function.rs`
- `/ssd0/git/EventsLog/crates/protocol/src/error.rs`
- `/ssd0/git/EventsLog/crates/protocol/src/attributes.rs`
- `/ssd0/git/EventsLog/docs/AI/SESSION_STATE.md`
- `/ssd0/git/EventsLog/docs/AI/TASK_INDEX.md`
- `/ssd0/git/EventsLog/docs/AI/tasks/TASK-003.md`

## Dependencies
- TASK-001 (Completed)
- TASK-002 (Completed)

## Inputs and Outputs
- **Inputs**: Protocol architecture from `docs/AI/ARCHITECTURE.md` (Sections 4, 7, 17, 23).
- **Outputs**: Rust protocol structs and enums with Serde serialization support and full unit test coverage.

## Acceptance Criteria
1. `Event`, `EventType`, `FunctionIdentity`, `FunctionExecution`, and `ExecutionError` types are fully defined with Serde serialization/deserialization.
2. Timestamps use `chrono::DateTime<Utc>`, IDs use `uuid::Uuid` or typed ID wrappers.
3. Unit tests prove round-trip JSON serialization and deserialization.
4. `cargo test -p eventslog-protocol` passes with 100% success.

## Verification Commands
- `cargo check -p eventslog-protocol`
- `cargo test -p eventslog-protocol`

## Risks and Assumptions
- Payload inputs and outputs can be arbitrary JSON values (`serde_json::Value`), ensuring flexible serialization from dynamic language SDKs.

## Status
DONE
