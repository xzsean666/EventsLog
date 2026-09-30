# TASK-036: Browser SDK In-Browser IndexedDB Local Mode (`sdks/browser`)

## Subsystem
Client SDK (`sdks/browser`)

## Milestone
Milestone 14: Local Storage Mode (SQLite & IndexedDB)

## Status
DONE

## Dependencies
- `TASK-035`: Node.js SDK In-Process SQLite Local Mode (`sdks/node`)
- `TASK-028`: Browser SDK Implementation with React & Vue Integrations

## Verification Criteria
- `BrowserConfig` extended with `mode?: 'remote' | 'local' | 'auto'` and `indexedDbName?: string` (default `'eventslog_db'`).
- `IndexedDBStorage` implemented in `sdks/browser/src/transport/indexeddb.ts`:
  - Automatically initializes `executions` object store with indexes (`trace_id`, `span_id`, `function_name`, `timestamp`, `service_name`, `status`).
  - Implements transactional batched persistence (`insertBatch`).
  - Implements browser-local query methods matching backend API contracts: `listFunctions`, `listExecutions`, `getExecution`, `getTrace` (hierarchical tree reconstruction), `getStats`, and `clear`.
- `BrowserBatchBuffer` updated to route batches to `IndexedDBStorage` when in `local` mode or `auto` mode without remote server.
- Zero external processes or server deployments required for browser applications; all telemetry (functions, fetch requests, React/Vue error boundaries, console logs) stored directly in browser IndexedDB.
- Comprehensive test suite in `sdks/browser/tests/indexeddb.test.ts` validates store creation, event persistence, aggregation queries, and trace reconstruction.
- Monorepo tests (`pnpm -r run test`, `cargo test --workspace`) pass 100%.

## Problem Statement
Frontend developers using `@eventslog/browser` in React, Vue, or vanilla JS applications need a zero-server local debugging experience. Requiring a running Rust Ingestion service or ClickHouse instance during frontend development creates unnecessary setup overhead. In local mode, the browser SDK must store telemetry events directly inside the browser's native `IndexedDB` with zero external dependencies, while providing query APIs so the Web Dashboard or in-page debug panels can inspect the data directly.

## Scope of Work
1. **Configuration Extension**:
   - Add `mode?: 'remote' | 'local' | 'auto'` and `indexedDbName?: string` to `BrowserConfig` in `sdks/browser/src/protocol/types.ts`.
2. **IndexedDB Storage Engine**:
   - Create `sdks/browser/src/transport/indexeddb.ts` implementing `IndexedDBStorage`.
   - Store schema matching canonical `ExecutionRow` attributes.
   - Implement function aggregation, execution filtering, trace tree reconstruction, and statistics calculation.
3. **Transport Buffer Integration**:
   - Update `BrowserBatchBuffer` in `sdks/browser/src/transport/buffer.ts` to support IndexedDB local dispatch.
   - Update `EventsLogBrowserClient` in `sdks/browser/src/client.ts` to expose `storage` and initialize IndexedDB local mode.
4. **Testing**:
   - Write comprehensive tests in `sdks/browser/tests/indexeddb.test.ts`.
   - Verify all existing browser tests pass.

## Implementation Details
- Extended `sdks/browser/src/protocol/types.ts` with `mode?: 'remote' | 'local' | 'auto'`, `indexedDbName?: string`, and query response types `ExecutionRow`, `FunctionSummary`, `TraceNode`, `TraceResponse`, `StatsResponse`.
- Implemented `IndexedDBStorage` (`sdks/browser/src/transport/indexeddb.ts`):
  - Database schema: `executions` store indexed on `trace_id`, `span_id`, `function_name`, `timestamp`, `service_name`, and `status`.
  - Batch transactional writing via `insertBatch`.
  - Query methods: `listFunctions` (aggregating call count, error count, avg duration, last seen), `listExecutions` (with pagination and filtering), `getExecution`, `getTrace` (hierarchical tree assembly via `buildTraceTree`), `getStats` (computing p50/p95/p99 percentiles), and `clear`.
- Updated `BrowserBatchBuffer` (`sdks/browser/src/transport/buffer.ts`) to route batches to `IndexedDBStorage` in pure `local` mode or as fallback in `auto` mode when remote servers are unreachable.
- Updated `EventsLogBrowserClient` (`sdks/browser/src/client.ts`) to expose `storage: IndexedDBStorage` and clean up connections upon `destroy()`.
- Added 8 comprehensive test cases in `sdks/browser/tests/indexeddb.test.ts`, all passing.
- Verified 31/31 browser tests and 89/89 full monorepo pnpm tests pass with zero errors.

