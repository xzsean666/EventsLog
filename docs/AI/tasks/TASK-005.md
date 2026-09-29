# TASK-005: Shared Configuration Model in Rust

## Objective
Implement shared configuration structures and YAML/JSON serialization logic in `crates/config` for backend services and client instrumentation rules (include/exclude function patterns, sampling rate, sanitization masks).

## Scope
- Initialize `crates/config/Cargo.toml` with `serde`, `serde_yaml`, and `globset`.
- Define backend server configuration in `crates/config/src/server.rs`:
  - `ServerConfig` (host, port, ClickHouse URL, buffer size, flush interval).
- Define instrumentation configuration models in `crates/config/src/instrumentation.rs`:
  - `InstrumentationConfig` (include patterns, exclude patterns, sampling rate, sensitive keys, max payload size).
  - Pattern matching logic evaluating whether a given module or function name matches include/exclude criteria.
- Unit tests covering glob pattern evaluation and YAML parsing.

## Allowed Files
- `/ssd0/git/EventsLog/Cargo.toml`
- `/ssd0/git/EventsLog/crates/config/Cargo.toml`
- `/ssd0/git/EventsLog/crates/config/src/lib.rs`
- `/ssd0/git/EventsLog/crates/config/src/server.rs`
- `/ssd0/git/EventsLog/crates/config/src/instrumentation.rs`
- `/ssd0/git/EventsLog/docs/AI/SESSION_STATE.md`
- `/ssd0/git/EventsLog/docs/AI/TASK_INDEX.md`
- `/ssd0/git/EventsLog/docs/AI/tasks/TASK-005.md`

## Dependencies
- TASK-003

## Inputs and Outputs
- **Inputs**: Configuration design from `docs/AI/ARCHITECTURE.md` Section 18.
- **Outputs**: Rust configuration models with YAML deserialization and pattern matcher.

## Acceptance Criteria
1. `InstrumentationConfig` parses YAML with include/exclude rules.
2. Exclude rules take strict precedence over include rules.
3. Unit tests verify exact and wildcard function matching (e.g. `OrderService.*`).
4. `cargo test -p eventslog-config` passes 100%.

## Verification Commands
- `cargo check -p eventslog-config`
- `cargo test -p eventslog-config`

## Risks and Assumptions
- Pattern matching should be fast and non-allocating where possible.

## Status
DONE
