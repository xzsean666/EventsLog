# TASK-025: End-to-End Integration Example & Full System Verification

## Objective
Implement an end-to-end multi-tiered Node.js example application demonstrating zero-code observability, and write an automated verification suite that runs Node.js app -> Ingestion Service -> ClickHouse -> Query Service -> Dashboard verification.

## Scope
- Implement multi-service Node.js demo in `examples/node/`:
  - `OrderService.ts` calling `PaymentService.ts` and `UserService.ts`.
  - Intentionally unmodified business code.
  - `eventslog.yaml` specifying inclusion patterns (`*Service.*`).
  - Run script using `node --import @eventslog/node/register`.
- Create end-to-end integration test runner in `scripts/test_e2e.sh`:
  - Starts Ingestion Service and Query Service.
  - Executes the Node.js application.
  - Queries Query Service to verify that `OrderService.createOrder` and nested `PaymentService.charge` executions and trace hierarchies are recorded accurately.
- Document step-by-step verification commands in `examples/node/README.md`.

## Allowed Files
- `examples/node/**`
- `scripts/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-025.md`

## Dependencies
- TASK-011
- TASK-014
- TASK-022
- TASK-024

## Inputs and Outputs
- **Inputs**: Running EventsLog backend and Node.js SDK.
- **Outputs**: Verified end-to-end demonstration proving zero-code function observability.

## Acceptance Criteria
1. Node.js business code runs without any manual instrumentation code.
2. Complete trace with parent-child hierarchy is captured and retrievable via Query API.
3. Input arguments and outputs are captured and verified.
4. `test_e2e.sh` passes successfully.

## Verification Commands
- `bash scripts/test_e2e.sh`

## Risks and Assumptions
- Use test containers or mock ClickHouse backend in automated CI runs.

## Status
DONE

