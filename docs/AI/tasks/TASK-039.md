# TASK-039: Full-Stack Audit Remediation & Comprehensive System Optimization

## Status
DONE

## Target Subsystem
Cross-System (`tests/e2e`, `dashboard`, `sdks/browser`, Project Scripts)

## Dependencies
TASK-038 (Local Mode Full-Stack End-to-End Simulation & Verification)

## Context & Objectives
Following the comprehensive system audit of EventsLog, several critical remediations and optimizations have been identified:
1. **E2E Simulation Compilation & NestJS DI Execution**:
   - `tests/e2e/src/index.ts` is missing `mode` and `sqlite_path` properties on `EventsLogConfig`, causing `tsc` compilation to fail with `TS2739`.
   - `tests/e2e/src/local_mode_e2e.ts` imports `'../../../dashboard/src/api/provider.ts'` with a `.ts` extension, failing `tsc` with `TS5097`.
   - Fixing `tests/e2e` `tsc` compilation restores the `dist/` build containing NestJS TypeScript decorator metadata (`emitDecoratorMetadata: true`), resolving the NestJS DI runtime failure and allowing `./scripts/run_real_world_e2e.sh` and `./scripts/run_flutter_e2e.sh` to execute to 100% completion.
2. **Dashboard Interactive Trace Navigation & Resilient Trace Loading**:
   - In `dashboard/src/App.tsx`, `onViewTrace` in `ExecutionDetailModal` currently ignores the `_tId` parameter. It must actively invoke `currentProvider.fetchTrace(traceId)` and update `activeTrace` before switching to the traces view.
   - Remove the brittle hardcoded trace ID fallback (`0af7651916cd43dd8448eb211c80319c`) or make trace fetching resilient to empty local databases.
3. **Browser SDK IndexedDB Retention & Memory Protection**:
   - In `sdks/browser/src/transport/indexeddb.ts`, add automatic FIFO pruning (e.g. keeping up to 5,000 recent executions or 7-day retention) during batch inserts to prevent unbounded storage and memory growth in long-running browser sessions.

## Acceptance Criteria
1. `tests/e2e/src/index.ts` and `tests/e2e/src/local_mode_e2e.ts` compile cleanly with `pnpm --filter @eventslog/e2e-real-world build` (0 TypeScript errors).
2. `./scripts/run_real_world_e2e.sh` executes with 100% success across all steps (NestJS + React + Vue + Ingestion + ClickHouse + Query API).
3. `./scripts/run_flutter_e2e.sh` executes with 100% success.
4. `./scripts/run_local_mode_simulation.sh` continues to pass 100% across all 4 scenarios.
5. In `dashboard/src/App.tsx`, clicking "View Trace" on any execution record correctly fetches the specific trace and displays it in `TraceTreeView`.
6. `IndexedDBStorage` in `@eventslog/browser` safely caps maximum stored records with automatic pruning.
7. All workspace unit tests pass (`cargo test --workspace`, `pnpm -r --filter=!./tests/** run test`, `pnpm --filter dashboard test`).

## Verification Commands
- `pnpm --filter @eventslog/e2e-real-world build`
- `./scripts/run_real_world_e2e.sh`
- `./scripts/run_flutter_e2e.sh`
- `./scripts/run_local_mode_simulation.sh`
- `cargo test --workspace`
- `pnpm -r --filter=!./tests/** run test`
- `pnpm --filter dashboard test`
- `pnpm --filter dashboard build`
