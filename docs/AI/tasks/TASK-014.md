# TASK-014: Query Service Function, Execution & Trace APIs

## Objective
Implement public HTTP query endpoints in `services/query` to serve the Dashboard: listing observed functions, paginating function executions, retrieving specific execution details, and reconstructing full trace trees.

## Scope
- Implement handlers in `services/query/src/handlers/`:
  - `GET /v1/functions`: Returns unique functions observed with execution count and error count.
  - `GET /v1/functions/{id}/executions`: Returns paginated execution history for a given function.
  - `GET /v1/executions/{id}`: Returns full details of an execution including sanitized input, output, duration, and error.
  - `GET /v1/traces/{trace_id}`: Reconstructs the hierarchy tree of parent/child executions.
  - `GET /v1/stats`: Returns overall throughput, p50/p95/p99 duration percentiles, and error rate.
- Integration tests validating JSON response structures for each endpoint.

## Allowed Files
- `services/query/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-014.md`

## Dependencies
- TASK-013

## Inputs and Outputs
- **Inputs**: HTTP GET queries with path parameters and query strings.
- **Outputs**: JSON responses conforming to Dashboard requirements.

## Acceptance Criteria
1. Reconstructs trace trees correctly from `span_id` and `parent_span_id`.
2. All 5 query endpoints return valid JSON responses with standard schemas.
3. Unit and integration tests pass.

## Verification Commands
- `cargo test -p eventslog-query handlers`

## Risks and Assumptions
- Broken trace trees (missing parent spans due to sampling) must still render root nodes gracefully.

## Status
DONE
