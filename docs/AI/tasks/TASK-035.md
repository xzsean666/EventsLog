# TASK-035: Node.js SDK In-Process SQLite Local Mode (`sdks/node`)

## Subsystem
Client SDK (`sdks/node`)

## Milestone
Milestone 14: Local Storage Mode (SQLite & IndexedDB)

## Status
DONE

## Verification Results
- `EventsLogConfig` extended with `mode: 'remote' | 'local' | 'auto'` and `sqlite_path: string` (default `./eventslog.db`), with environment overrides `EVENTSLOG_MODE` and `EVENTSLOG_DB_PATH`.
- Implemented `SqliteTransport` using native Node.js `node:sqlite` (`DatabaseSync`), auto-creating the identical SQLite schema and indices as `eventslog-local`.
- Zero-config local mode automatically defaults `instrumentation.include = ['*']` if no `eventslog.yaml` is provided, ensuring external applications get zero-code function observability out-of-the-box.
- Built-in graceful process exit flush persists events into `./eventslog.db` reliably.
- Real-world simulated external app tests proved zero-code interception, arguments capture, return values capture, duration timing, and error tracking into SQLite with 0 external processes or server deployments running.
- All 58 unit/integration tests in `sdks/node` pass.
- All 80 workspace tests in `pnpm -r run test` pass.
- All 54 workspace Rust tests in `cargo test --workspace` pass.

## Dependencies
- `TASK-034`: Rust Local Service with SQLite Storage Engine (`services/local`)
- `TASK-021`: Node.js SDK Auto-Batching Engine, Ring Buffer & Transport

## Verification Criteria
- `EventsLogConfig` extended with `mode: 'remote' | 'local' | 'auto'` and `sqlite_path: string` (default `./eventslog.db`).
- `SqliteTransport` implemented using Node.js built-in `node:sqlite` (DatabaseSync), creating identical `executions` schema and indices as `eventslog-local`.
- In `mode: 'local'`, `@eventslog/node` writes all function execution events directly into `./eventslog.db` without needing any external server or network process running.
- In `mode: 'auto'`, attempts remote HTTP endpoint if reachable; falls back to SQLite local storage seamlessly if unreachable or no endpoint configured.
- Comprehensive test suite in `sdks/node/tests/sqlite-transport.test.ts` validates zero-server local recording, schema initialization, parameter binding, and WAL persistence.
- `pnpm -r run test` and `cargo test --workspace` pass 100%.

## Problem Statement
When external applications install only `@eventslog/node` and desire local development and debugging, requiring them to deploy ClickHouse, configure Docker, or launch external daemon services creates friction. In local mode, the SDK itself must run directly in-process and persist telemetry to SQLite (`./eventslog.db`) without any external dependencies or extra setup.

## Scope of Work
1. **Configuration Extension**:
   - Add `mode?: 'remote' | 'local' | 'auto'` to `EventsLogConfig` (environment override: `EVENTSLOG_MODE`).
   - Add `sqlite_path?: string` to `EventsLogConfig` (environment override: `EVENTSLOG_DB_PATH` or `./eventslog.db`).
2. **SQLite In-Process Transport**:
   - Create `sdks/node/src/transport/sqlite.ts` implementing `TelemetryTransport` / `sendBatch()`.
   - Auto-create schema `executions` table matching canonical schema if not exists.
   - Insert batched events in a single transaction.
3. **Transport Selection & Batching Engine Integration**:
   - Update `Batcher` in `sdks/node/src/batching/batcher.ts` to accept either `HttpTransport` or `SqliteTransport` based on configuration mode.
4. **Testing**:
   - Write comprehensive tests in `sdks/node/tests/sqlite-transport.test.ts` ensuring direct in-process writing, table verification, and zero failure.
