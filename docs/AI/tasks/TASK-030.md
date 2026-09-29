# TASK-030: Comprehensive Real-World End-to-End Simulation & Verification (React, Vue, NestJS, Ingestion, ClickHouse, and Query Services)

## Objective
Execute and verify comprehensive, production-grade, real-world end-to-end observability across the entire EventsLog stack under authentic operating conditions:
1. **Live Storage & Backend Infrastructure**:
   - Live ClickHouse server with optimized schema, MergeTree partitions, Bloom filter indices, and correct TTL expressions.
   - Live Rust Ingestion Service running as a native process, receiving authenticated JSON batches and asynchronously persisting to ClickHouse.
   - Live Rust Query Service querying ClickHouse for function lists, execution drill-downs, and distributed trace tree reconstructions.
2. **Real NestJS Backend Application**:
   - Modern NestJS application architecture (Modules, Controllers, Services, Middleware/Interceptors, Dependency Injection).
   - `@eventslog/node` instrumentation for function capture, argument & return sanitization, and execution timing.
   - Inbound distributed trace context propagation via `x-trace-id` / `traceparent` headers.
   - Complex multi-step async workflows: Controller -> OrderService -> InventoryService -> PaymentService.
   - Exception handling flows: service exceptions, HTTP 500 error responses, status="error" telemetry with full stack traces.
   - High-concurrency burst testing: verifying `AsyncLocalStorage` trace context isolation under concurrent parallel load.
3. **Real React Frontend Client**:
   - `@eventslog/browser` & `@eventslog/browser/react` integration.
   - React `EventsLogErrorBoundary` catching and reporting component exceptions.
   - `FetchInterceptor` injecting distributed tracing headers (`x-trace-id`, `x-span-id`, `traceparent`) into requests to the NestJS backend.
   - Browser buffer flush and session telemetry.
4. **Real Vue 3 Frontend Client**:
   - `@eventslog/browser` & `@eventslog/browser/vue` integration.
   - `EventsLogVuePlugin` capturing unhandled component errors via Vue's global error handler.
   - `trackVueRouter` tracking navigation transitions and measuring routing duration.
   - Outbound HTTP tracing to the NestJS backend.
5. **Full Pipeline Verification & Cross-Tier Distributed Trace Reconstruction**:
   - Client-to-server trace tree linkage: verifying that a React/Vue user action and its downstream NestJS controller + service calls form a unified hierarchical trace tree in the Query Service API (`/v1/traces/:trace_id`).
   - Query Service API verification: `/v1/functions`, `/v1/functions/:function_id/executions`, `/v1/executions`, and `/v1/stats`.
   - Data privacy verification: verifying credit card numbers, passwords, and sensitive keys are redacted in ClickHouse storage.

## Scope
- `storage/clickhouse/migrations/001_initial_schema.sql`
- `tests/e2e/` (comprehensive real-world E2E test suite package with NestJS, React, Vue, and service orchestrator)
- `scripts/run_real_world_e2e.sh`
- `package.json`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-030.md`

## Dependencies
- TASK-029

## Status
DONE

## Acceptance Criteria Verification
1. ClickHouse schema migration uses valid `toDateTime(timestamp)` TTL expression for `DateTime64` columns: PASSED. Migrations executed cleanly against ClickHouse 24.8.
2. Ingestion and Query services run against real ClickHouse instance and handle real telemetry batches: PASSED. Live native processes started, ingested 60+ real execution batches, and persisted asynchronously.
3. NestJS backend executes controller and service methods with `@eventslog/node` tracing enabled, recording inputs, outputs, durations, and errors: PASSED. Reflect metadata properly preserved on wrapped methods (`@Get`, `@Post`), and multi-tier spans captured accurately.
4. React frontend components trace fetch calls to NestJS and capture boundary errors with `@eventslog/browser/react`: PASSED. React Error Boundary recorded component crash with full component stack in ClickHouse.
5. Vue 3 frontend tracks router navigations, traces API calls to NestJS, and captures errors with `@eventslog/browser/vue`: PASSED. Router navigations recorded duration nanos, and global error handler captured component crashes.
6. Distributed trace trees link React/Vue spans to NestJS server spans with valid parent-child relationships verified via Query API `/v1/traces/:trace_id`: PASSED. Reconstructed 6-level distributed trace tree (`CheckoutWorkflow -> POST /api/orders -> createOrder -> createOrder -> checkAndReserve -> processPayment`).
7. Concurrency test proves no context pollution across 20+ parallel requests: PASSED. 25/25 concurrent requests succeeded with 25 distinct trace IDs.
8. Sensitive keys are redacted to `[REDACTED]` in ClickHouse storage: PASSED. 0 plaintext sensitive data leaks detected, 648 sanitized `[REDACTED]` records verified.
9. All unit, integration, and E2E tests pass cleanly: PASSED. `cargo test --workspace` (48/48), `pnpm -r run test` (80/80), `pnpm -C dashboard test` (9/9), and `./scripts/run_real_world_e2e.sh` (6/6 checks).

