# TASK-028: Browser SDK Implementation with React & Vue Integrations

## Objective
Implement a production-grade, zero-dependency client-side Web Browser SDK (`@eventslog/browser`) for the EventsLog platform, enabling function-level observability, distributed trace propagation, frontend performance tracking, and error monitoring across modern web applications and SPA frameworks:
1. **Core Browser SDK (`@eventslog/browser`)**:
   - Browser-compatible Trace Context manager with synchronous & Promise continuation.
   - High-performance ID generator using Web Crypto API (`crypto.getRandomValues`) with robust fallback.
   - Auto-batching ring buffer with dual transport engine: standard HTTP `fetch` (with `keepalive: true`) and `navigator.sendBeacon` fallback for page unload (`pagehide`, `visibilitychange`).
   - Zero-code browser interceptors:
     - Global unhandled errors & unhandled Promise rejections.
     - Global `window.fetch` network interceptor injecting distributed trace headers (`X-Trace-Id`, `X-Span-Id`).
     - Global `console` logger interception (`log`, `warn`, `error`).
   - Client-side data sanitizer and payload byte limiter.
   - Declarative/manual instrumentation API: `traceAsync`, `wrapFunction`, `captureError`, `startSpan`.
2. **Framework Integrations**:
   - **React** (`@eventslog/browser/react`):
     - `EventsLogErrorBoundary` component capturing rendering failures with component stacks.
     - `useTrace` and `useTracedCallback` hooks for React functional components.
     - `withTracing` Higher-Order Component (HOC).
   - **Vue** (`@eventslog/browser/vue`):
     - Vue 3 plugin (`createEventsLogVue`) hooking into `app.config.errorHandler`.
     - Route navigation tracker for `vue-router`.
3. **Backend Ingestion CORS Support**:
   - Add CORS middleware (`tower_http::cors::CorsLayer`) to `services/ingestion` to allow cross-origin browser telemetry uploads and preflight requests.
4. **Testing & Build Verification**:
   - Multi-target build (`cjs`, `esm`, `d.ts`) using `tsup`.
   - Comprehensive test suite using `vitest` covering context propagation, fetch patching, error capturing, React error boundary, Vue error handler, sanitization, and batch transport.

## Scope
- `services/ingestion/src/router.rs`: Add permissive CORS layer for browser telemetry.
- `sdks/browser/package.json`: Browser SDK package configuration with React and Vue optional peer dependencies.
- `sdks/browser/tsconfig.json`: TypeScript configuration for browser target.
- `sdks/browser/tsup.config.ts`: Multi-entry bundle configuration (`.`, `./react`, `./vue`).
- `sdks/browser/src/protocol/types.ts`: Browser protocol models aligned with EventsLog specifications.
- `sdks/browser/src/tracing/context.ts`: Web Crypto context propagation & span tree management.
- `sdks/browser/src/sanitization/sanitizer.ts`: Browser payload sanitizer.
- `sdks/browser/src/transport/buffer.ts`: Non-blocking ring buffer & dual transport (`fetch` + `sendBeacon`).
- `sdks/browser/src/interceptors/errors.ts`: `window.onerror` & `unhandledrejection` interceptor.
- `sdks/browser/src/interceptors/fetch.ts`: `window.fetch` interceptor with distributed trace propagation.
- `sdks/browser/src/interceptors/console.ts`: `console` stream interceptor.
- `sdks/browser/src/client.ts`: Main client lifecycle (`init`, `startSpan`, `captureError`, `flush`).
- `sdks/browser/src/index.ts`: Public API exports.
- `sdks/browser/src/react/index.ts`: React Error Boundary, Hooks, and HOC.
- `sdks/browser/src/vue/index.ts`: Vue 3 plugin and error handler.
- `sdks/browser/tests/context.test.ts`: Context & ID generation tests.
- `sdks/browser/tests/interceptors.test.ts`: Fetch, console, and error interception tests.
- `sdks/browser/tests/transport.test.ts`: Buffer and batch transport tests.
- `sdks/browser/tests/react.test.ts`: React integration tests.
- `sdks/browser/tests/vue.test.ts`: Vue integration tests.
- `docs/AI/SESSION_STATE.md`: Update session state.
- `docs/AI/TASK_INDEX.md`: Register TASK-028.

## Dependencies
- TASK-027

## Acceptance Criteria
1. Node SDK and Browser SDK separation is clearly architected, with Browser SDK having zero Node-specific runtime dependencies.
2. Ingestion service handles CORS preflight (`OPTIONS`) and accepts cross-origin browser payloads.
3. Browser SDK provides dual transport: `fetch` with `keepalive: true` and `sendBeacon` for page unloads.
4. Auto-instrumentation intercepts `fetch`, injects distributed trace context (`X-Trace-Id`, `X-Span-Id`), and captures duration and status.
5. React integration provides functional `EventsLogErrorBoundary` and `useTrace` / `useTracedCallback`.
6. Vue integration provides `createEventsLogVue` plugin capturing component runtime errors.
7. All tests in `sdks/browser` pass (`pnpm -r run test`), build succeeds (`pnpm run build`), and Rust workspace tests pass (`cargo test --workspace`).

## Verification Commands
- `pnpm -C sdks/browser run test`
- `pnpm -r run test`
- `pnpm run build`
- `cargo test --workspace`

## Status
DONE
