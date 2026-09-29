# TASK-027: Comprehensive System Optimization: Security Hardening, Hot-Path Performance & Zero-Code Console Log Capture

## Objective
Carry out a comprehensive optimization across security, performance, and functionality based on the system audit:
1. **Security Hardening**:
   - Add constant-time API key comparison in `services/ingestion` and `services/query` to prevent timing attacks.
   - Implement optional API key authentication middleware in `services/query` when `api_key` is configured on the server.
   - Update Dashboard API client to support passing API keys.
   - Enhance data sanitizer in `@eventslog/node` with sensitive value pattern detection (JWTs, credit cards, bearer tokens) to protect positional arguments in flat parameter lists.
   - Harden SQL query generation against LIKE wildcard injection (`%`, `_`) and enforce strict limits on pagination `limit` in `services/query`.
2. **Performance Optimization**:
   - Optimize Span ID and Trace ID generation in `@eventslog/node` to eliminate synchronous OS entropy syscall bottlenecks on hot execution paths.
   - Enforce query result set clamping in `services/query` to defend against ClickHouse and server OOM.
3. **Functionality Expansion (Zero-Code Logging & ESM)**:
   - Implement zero-code console log interception in `@eventslog/node`, automatically capturing `console.log/warn/error` and associating them with the active `TraceContext`.
   - Export ESM loader/hook entrypoint for Node.js `--import` / `--loader` compatibility.

## Scope
- `services/ingestion/src/auth.rs`: Constant-time string comparison.
- `services/query/src/auth.rs`: AuthContext extractor for Query service.
- `services/query/src/router.rs`: Attach auth check to query routes.
- `services/query/src/storage/client.rs`: LIKE wildcard escaping and max limit clamping.
- `services/query/src/handlers/functions.rs`: Enforce limit upper bounds.
- `services/query/tests/query_api_test.rs`: Test query authentication and limit clamping.
- `sdks/node/src/tracing/context.ts`: High-performance ID generator using pre-buffered random bytes.
- `sdks/node/src/sanitization/sanitizer.ts`: Value-level sensitive pattern detection for positional parameters.
- `sdks/node/src/logging/console.ts`: Zero-code console interception linked to trace context.
- `sdks/node/src/register.ts`: Initialize console interception if enabled.
- `sdks/node/src/loader/esm.ts`: ESM customization hook.
- `sdks/node/package.json`: Export ESM loader and register hooks.
- `dashboard/src/api/client.ts`: Support API key authentication header.
- `docs/AI/SESSION_STATE.md`: Update session state.
- `docs/AI/TASK_INDEX.md`: Register TASK-027.

## Dependencies
- TASK-026

## Acceptance Criteria
1. All workspace tests pass (`cargo test --workspace`, `pnpm -r run test`).
2. Query service rejects requests with invalid API key when `EVENTSLOG_API_KEY` is configured.
3. Hot-path Span ID generation performs faster without synchronous `crypto.randomBytes` per call.
4. Positional parameters containing credit cards or JWT tokens are automatically redacted by `sanitizeValue`.
5. Console logs inside instrumented functions are captured and linked to the active trace context.
6. End-to-end demo and verification scripts pass (`bash scripts/test_e2e.sh`).

## Verification Commands
- `cargo test --workspace`
- `pnpm -r run test`
- `pnpm run build`
- `bash scripts/test_e2e.sh`

## Status
DONE

