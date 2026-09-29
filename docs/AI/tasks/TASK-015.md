# TASK-015: Platform API Service Skeleton & Management Endpoints

## Objective
Implement `services/api` for control-plane platform capabilities: project registry, environment configuration, and API key management.

## Scope
- Initialize `services/api/Cargo.toml` and add to root `Cargo.toml` members.
- Implement project and API key management models in `services/api/src/models.rs`.
- Implement HTTP routes in `services/api/src/router.rs`:
  - `GET /health`
  - `POST /v1/projects`
  - `GET /v1/projects`
  - `POST /v1/projects/{project_id}/keys`
- Unit tests verifying project registration and key generation.

## Allowed Files
- `Cargo.toml`
- `services/api/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-015.md`

## Dependencies
- TASK-003
- TASK-005

## Inputs and Outputs
- **Inputs**: HTTP management requests.
- **Outputs**: Managed platform resource responses.

## Acceptance Criteria
1. `services/api` compiles within Cargo workspace.
2. Projects and API keys can be created and queried via REST endpoints.
3. Unit tests pass.

## Verification Commands
- `cargo check -p eventslog-api`
- `cargo test -p eventslog-api`

## Risks and Assumptions
- Initial storage for platform metadata can be in-memory or SQLite/Postgres.

## Status
DONE
