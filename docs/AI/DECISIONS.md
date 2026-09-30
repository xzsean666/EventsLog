# Architecture & Engineering Decisions (DECISIONS)

## DEC-001: Monorepo Workspace Strategy
- **Context**: The platform contains Rust backend services/crates, Node.js SDK, frontend web dashboard, and shared packages.
- **Decision**: Use a hybrid workspace layout:
  - Root `Cargo.toml` manages all Rust crates and services under `crates/*` and `services/*`.
  - Root `package.json` with `pnpm-workspace.yaml` manages Node.js SDK (`sdks/node`), dashboard (`dashboard`), and shared packages (`packages/*`).
- **Consequences**: Single source checkout, synchronized versioning across protocol and services, standard developer experience.

## DEC-002: Protocol-First Data Model
- **Context**: Multiple SDKs (Node, Python, Go, Rust) need to talk to the same Ingestion Service and share identical event semantics.
- **Decision**: Define canonical models in `crates/protocol` (Rust) and mirror typed specifications in SDKs. Events are serialized as JSON over HTTPS (with optional gzip/brotli compression and batching).
- **Consequences**: Standardized schema across language boundaries, strict validation at the ingestion boundary.

## DEC-003: ClickHouse Storage for Function Observability
- **Context**: Function observability produces high-volume append-only event data (executions, inputs, outputs, timestamps, errors, traces).
- **Decision**: ClickHouse is chosen as the primary data store using `ReplacingMergeTree` / `MergeTree` engines with partitioning by date and sorting keys optimized for `(project_id, service_name, function_name, timestamp)`.
- **Consequences**: Exceptional compression ratio for JSON-like payloads and fast aggregation queries for traces and function metrics.

## DEC-004: Node.js Zero-Code Instrumentation Approach
- **Context**: Business code should not require any modifications or manual decorator/wrapper calls.
- **Decision**:
  - Provide a preload/loader hook (e.g. `node --import @eventslog/node/register` or `node -r @eventslog/node/register`).
  - Use `AsyncLocalStorage` for trace propagation.
  - Dynamically intercept exports and class methods matching inclusion patterns while respecting exclusion rules.
- **Consequences**: Fully transparent to the user's business code; clean detachability.

## DEC-005: Non-Blocking Observability Failure Isolation
- **Context**: Observability must never crash or block the host application.
- **Decision**: SDK event capture runs asynchronously. Transmission uses bounded ring buffers and worker batch timers. On buffer exhaustion or network error, events are safely dropped rather than blocking the event loop or exhausting memory.
- **Consequences**: Maximum host application reliability and predictable memory footprint.

## DEC-006: ClickHouse Production Docker Optimization & Write Backpressure Defense
- **Context**: In high-throughput observability ingestion, ClickHouse default settings suffer from two critical pitfalls:
  1. System operation logs (`query_log`, `part_log`, `trace_log`) explode to tens/hundreds of GBs.
  2. Micro-batch ingestion generates parts faster than background merges, causing Code 252 "Too many parts" write stall/hangs.
- **Decision**: Strictly adopt the optimization blueprint in `docs/ClickHouse-Docker-Optimization.md`:
  - Docker Compose: Configure `ulimits.nofile: 262144`, container log rotation (`50m/3`), and healthchecks.
  - Server configs: Mount `config.d/system_logs.xml` (TTL 1-2 days on system logs, remove `trace_log`, set `background_pool_size: 16`, `parts_to_delay_insert: 300`, `parts_to_throw_insert: 600`) and `users.d/tuning.xml` (enable `async_insert=1`, `wait_for_async_insert=1`, `log_queries=0`).
  - Client ingestion: Ingestion Service connection URL explicitly passes `async_insert=1&wait_for_async_insert=1&async_insert_busy_timeout_ms=200&log_queries=0`.
  - DDL: Monthly partitions (`toYYYYMM(timestamp)`), table `SETTINGS parts_to_delay_insert = 300, parts_to_throw_insert = 600, max_delay_to_insert = 1`.
- **Consequences**: Prevents disk exhaustion from system logs, eliminates "Too many parts" write stalls, and maximizes ingestion throughput.

## DEC-007: Local Storage Mode Architecture (In-Process SQLite & In-Browser IndexedDB)
- **Context**: In local development, testing, and debugging, requiring developers to deploy and run ClickHouse, Docker, and multiple backend microservices creates an unnecessary barrier to adoption. Developers want external projects that only install `@eventslog/node` or `@eventslog/browser` to run immediately without any external services.
- **Decision**: Provide a zero-infrastructure dual local storage architecture:
  1. **Node.js**: Use Node's native `node:sqlite` (`DatabaseSync`) with WAL mode (`eventslog.db`) to capture and persist telemetry directly in-process.
  2. **Browser**: Use in-browser `IndexedDB` (`eventslog_db`) with indexed queries and an optional floating in-page DevTools drawer widget (`devtools: true`).
  3. **Standalone Rust Service**: Provide `services/local` (`eventslog-local`) embedding SQLite via `rusqlite` with WAL mode, offering unified HTTP Ingestion and Query APIs on port 8080.
  4. **Dashboard**: Implement a pluggable `TelemetryDataProvider` (`HttpDataProvider`, `IndexedDBDataProvider`) and Topbar `ProviderRegistry` switcher.
- **Consequences**: Enables 100% zero-server, zero-docker local observability while maintaining complete data model parity with the distributed ClickHouse backend.
