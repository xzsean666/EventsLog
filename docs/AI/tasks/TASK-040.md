# TASK-040: Flutter SDK & Server-Side Full-Stack Comprehensive Optimization & Hardening

## Status
DONE

## Target Subsystem
Cross-System (`services/local`, `sdks/flutter`, `tests/e2e`)

## Dependencies
TASK-039 (Full-Stack Audit Remediation & Comprehensive System Optimization)

## Context & Objectives
Following the comprehensive architectural and usability audit of the Flutter client SDK and server backend, several critical enhancements and bug fixes are required:
1. **Server-Side `eventslog-local` Routing Alignment**:
   - Add `/v1/events/batch` route alias to `services/local/src/router.rs` matching `services/ingestion`, resolving 404 errors when mobile apps follow standard batch endpoint conventions.
   - Add integration tests verifying both `/v1/events` and `/v1/events/batch`.
2. **Flutter AST Transformer & CLI Engine Remediation**:
   - Fix async void / `Future<void>` transformation in `sdks/flutter/src/transformer/rewriter.ts` to ensure `EventsLog.runWithSpan` is properly returned in async functions, preventing un-awaited detached executions.
   - Fix generic return type parsing (`Future<T>`, `List<T>`, etc.) in `sdks/flutter/src/transformer/parser.ts` by scanning backwards past `<...>` token boundaries.
   - Provide automatic runtime configuration bridging from `eventslog.yaml` to the Dart runtime during AST instrumentation.
3. **Flutter Client SDK Mobile Hardening & Observability Ergonomics**:
   - Implement `EventSanitizer` in `sdks/flutter/lib/src/sanitizer.dart` with case-insensitive `sensitive_keys` masking (`password`, `token`, `secret`, `authorization`, `api_key`, `cvv`, etc.), cycle protection, and safe serialization for custom Dart objects in both inputs and outputs.
   - Upgrade `AutoBatchBuffer` in `sdks/flutter/lib/src/buffer.dart` with resilience: retry failed batches on network glitches instead of silently dropping all events.
   - Add `EventsLog.getTraceHeaders()` for W3C `traceparent` and distributed context propagation to enable mobile-to-backend tracing across HTTP/Dio clients.
4. **Comprehensive Test Suite & E2E Verification**:
   - Add Dart unit tests in `sdks/flutter/test/`.
   - Update Vitest suites for AST transformer and parser.
   - Execute and verify all Rust, TypeScript, and Dart tests with 100% success.

## Acceptance Criteria
1. `services/local` accepts batch event ingestion on both `POST /v1/events` and `POST /v1/events/batch`.
2. `parser.ts` correctly extracts generic return types (e.g. `Future<void>`, `Future<String>`).
3. `rewriter.ts` retains `return` on async functions returning `Future<void>` or `Future<T>`, ensuring callers can `await` them.
4. `sdks/flutter` runtime sanitizes sensitive arguments/returns and handles non-serializable objects and circular references safely.
5. `sdks/flutter` buffer does not immediately drop events on transient network failures, and provides distributed tracing headers.
6. All workspace tests pass:
   - `cargo test --workspace`
   - `pnpm -r --filter=!./tests/** run test`
   - `dart test` in `sdks/flutter`
   - `./scripts/run_flutter_e2e.sh`
   - `./scripts/run_local_mode_simulation.sh`

## Verification Commands
- `cargo test -p eventslog-local`
- `pnpm --filter @eventslog/flutter run test`
- `cd sdks/flutter && dart test`
- `./scripts/run_flutter_e2e.sh`
- `./scripts/run_local_mode_simulation.sh`
- `cargo test --workspace`
- `pnpm -r --filter=!./tests/** run test`
