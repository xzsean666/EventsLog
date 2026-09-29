# TASK-023: Dashboard Web Application Setup & API Client

## Objective
Establish the frontend single-page application in `dashboard` using React, Vite, and TypeScript, and implement typed API clients communicating with the EventsLog Query Service.

## Scope
- Initialize `dashboard/package.json` with React 18/19, Vite, Lucide icons, and Tailwind CSS.
- Configure `dashboard/vite.config.ts` and `dashboard/tsconfig.json`.
- Implement API client in `dashboard/src/api/client.ts` to consume Query Service endpoints:
  - `fetchFunctions()`
  - `fetchFunctionExecutions(functionId)`
  - `fetchExecution(executionId)`
  - `fetchTrace(traceId)`
  - `fetchStats()`
- Set up root navigation layout with Sidebar and Topbar.

## Allowed Files
- `dashboard/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-023.md`

## Dependencies
- TASK-001
- TASK-002

## Inputs and Outputs
- **Inputs**: Query API endpoints from `services/query`.
- **Outputs**: Compiling React Vite web application with responsive layout and typed API layer.

## Acceptance Criteria
1. `pnpm --filter dashboard build` builds production bundle without errors.
2. API client handles error responses gracefully.
3. Dashboard shell renders clean navigation tabs (Overview, Functions, Traces).

## Verification Commands
- `pnpm --filter dashboard run build`

## Risks and Assumptions
- Use mock data fallback when Query Service is not actively connected during frontend unit tests.

## Status
DONE

