# TASK-009: Ingestion Service Event Ingestion Endpoint & Authentication

## Objective
Implement the `POST /v1/events` endpoint in the Ingestion Service to accept single events or batched events from SDKs, authenticate requests via API keys or project headers, and perform schema validation.

## Scope
- Implement authentication middleware in `services/ingestion/src/auth.rs` validating `x-api-key` or `Authorization: Bearer <key>`.
- Implement batch ingestion handler in `services/ingestion/src/handlers/ingest.rs`:
  - Support `POST /v1/events` accepting payload `BatchEventPayload` (array of `Event`).
  - Validate payload size limits (e.g. max 10MB per batch, max 5,000 events per request).
  - Return HTTP 202 Accepted with count of accepted events and ingest ID.
- Unit and integration tests for authentication acceptance/rejection and invalid payload handling.

## Allowed Files
- `services/ingestion/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-009.md`

## Dependencies
- TASK-008

## Inputs and Outputs
- **Inputs**: HTTP POST requests containing serialized JSON event arrays.
- **Outputs**: HTTP 202 response or 401 Unauthorized / 400 Bad Request error response.

## Acceptance Criteria
1. Requests without valid API key header return HTTP 401.
2. Valid event batches return HTTP 202 with `{ "status": "accepted", "count": N }`.
3. Malformed JSON payloads return HTTP 400 with structured error information.
4. `cargo test -p eventslog-ingestion` passes.

## Verification Commands
- `cargo test -p eventslog-ingestion --test ingest_api_test`

## Risks and Assumptions
- Use constant or mock API key verification for standalone mode before the platform API key database is connected.

## Status
DONE
