# TASK-013: Query Service ClickHouse Storage Client

## Objective
Implement ClickHouse query execution logic inside `services/query`, providing typed query builders for listing observed functions, retrieving execution records, fetching execution trace trees, and calculating aggregate statistics.

## Scope
- Implement storage query client in `services/query/src/storage/client.rs`.
- Define query filters:
  - `FunctionFilter` (project_id, service_name, time_range, search_term).
  - `ExecutionFilter` (function_name, status, limit, offset).
  - `TraceQuery` (trace_id).
- Implement SQL query generation targeting `function_executions` ClickHouse table.
- Unit tests with mock responses verifying query parsing and response formatting.

## Allowed Files
- `services/query/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-013.md`

## Dependencies
- TASK-007
- TASK-012

## Inputs and Outputs
- **Inputs**: Filter parameters from HTTP requests.
- **Outputs**: Parsed vector of execution rows and aggregation summaries.

## Acceptance Criteria
1. Query client generates syntactically valid ClickHouse SQL for functions, executions, and traces.
2. Query results deserialize into typed domain models.
3. Unit tests pass with mock query data.

## Verification Commands
- `cargo test -p eventslog-query storage`

## Risks and Assumptions
- Use parametrized or escaped queries to prevent SQL injection.

## Status
DONE
