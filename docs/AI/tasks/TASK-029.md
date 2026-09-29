# TASK-029: Comprehensive System Hardening & Optimization: Security, Performance, and Contract Alignment

## Objective
Remediate critical, high, and medium severity findings discovered during the comprehensive full-stack audit across security, performance, and functionality:
1. **Security & Third-Party Compatibility**:
   - Implement `allowedTracingOrigins` in `@eventslog/browser` to prevent injecting custom tracing headers (`X-Trace-Id`, `X-Span-Id`, `traceparent`) into untrusted/third-party origins (fixing CORS preflight failures on external APIs like Stripe/Google Analytics).
   - Harden `BrowserSanitizer` against `Window`, `Document`, `Node`, `Event`, and cross-origin iframe references with property-level exception isolation.
   - Protect Promise rejection error stringification against circular references in `GlobalErrorInterceptor`.
   - Support `api_key` URL query parameter fallback in `services/ingestion` to allow `navigator.sendBeacon` telemetry upload on page unload.
   - Harden constant-time comparison in `services/ingestion` and `services/query` against length timing leak.
2. **Functionality & Contract Alignment**:
   - Fix `crates/schema/src/convert.rs` to properly map `EventPayload::Error` and non-function execution errors into `status: "error"` with preserved `error_type`, `error_message`, and `error_stack` (preventing browser error events from being dropped with empty error strings in ClickHouse).
   - Fix `services/query/src/handlers/functions.rs` to support composite `function_id` (`service:module:function`), allowing the Dashboard to display function execution records without empty lists.
   - Fix `isClass` in `@eventslog/node` to avoid misclassifying functions with static methods as classes, ensuring primary function entry points are properly wrapped.
   - Enforce non-intrusive error isolation around `capturePayload` in `@eventslog/node` wrapper to guarantee telemetry issues never abort host application execution.
   - Improve `trackVueRouter` in `@eventslog/browser/vue` to measure actual route transition duration between `beforeEach` and `afterEach`.
3. **Performance & Storage Optimization**:
   - Add Bloom filter skipping indices for `event_id` and `span_id` in ClickHouse schema.
   - Optimize ClickHouse trace query and single-execution query paths.
   - Eliminate redundant 4x JSON serialization payload inflation in `TraceResponse` and `TraceEnvelope`.
   - Bounded time window for percentile/quantiles computation in `/v1/stats`.
   - Drain full queue (up to size limits) on browser page unload instead of only a single batch slice.

## Scope
- `crates/schema/src/convert.rs`
- `crates/schema/tests/`
- `services/ingestion/src/auth.rs`
- `services/query/src/auth.rs`
- `services/query/src/handlers/functions.rs`
- `services/query/src/handlers/traces.rs`
- `services/query/src/handlers/stats.rs`
- `storage/clickhouse/migrations/001_initial_schema.sql`
- `sdks/browser/src/protocol/types.ts`
- `sdks/browser/src/client.ts`
- `sdks/browser/src/interceptors/fetch.ts`
- `sdks/browser/src/interceptors/errors.ts`
- `sdks/browser/src/sanitization/sanitizer.ts`
- `sdks/browser/src/transport/buffer.ts`
- `sdks/browser/src/vue/index.ts`
- `sdks/browser/tests/`
- `sdks/node/src/instrumentation/patcher.ts`
- `sdks/node/src/instrumentation/wrapper.ts`
- `sdks/node/tests/`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-029.md`

## Dependencies
- TASK-028

## Acceptance Criteria
1. `cargo test --workspace` passes cleanly.
2. `pnpm -r run test` passes cleanly.
3. `pnpm -C dashboard test` and `pnpm run build` pass cleanly.
4. Browser SDK `fetch` interceptor only injects trace headers to same-origin or configured `allowedTracingOrigins`.
5. Error events (`captureError`) properly map to `status: "error"` with full error type, message, and stack in ClickHouse rows.
6. Query API handles composite `function_id` correctly in `list_function_executions`.
7. Browser SDK unload flushes all queued events.
8. Node SDK `isClass` does not skip wrapping functions with static helpers.
9. Node SDK wrapper isolates payload capture in try-catch.

## Status
DONE
