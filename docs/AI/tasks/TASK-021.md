# TASK-021: Node.js SDK Auto-Batching Engine (Count/Time Triggers), Ring Buffer & Transport

## Objective
Implement client-side dual-trigger auto-batching, bounded memory buffering, probabilistic sampling, and non-blocking HTTP transport in `@eventslog/node`. The SDK must automatically batch and dispatch observability logs based on either record count threshold OR time interval, and flush cleanly on process termination without impacting host application performance.

## Scope
- Implement sampling logic in `sdks/node/src/sampling/sampler.ts` (head-based rate sampling).
- Implement the Auto-Batching Buffer in `sdks/node/src/batching/batcher.ts`:
  - **Count-Triggered Auto-Batch**: Automatically triggers an immediate HTTP flush when buffered events reach `max_batch_size` (e.g., default 100 events).
  - **Time-Triggered Auto-Batch**: Runs an internal timer that automatically flushes buffered events when `flush_interval_ms` (e.g., default 500ms) elapses, even if the count threshold has not been reached.
  - **Timer Non-Blocking Lifecycle**: Ensure the interval timer uses `.unref()` so it does not keep the Node.js event loop alive when the application is ready to terminate.
  - **Bounded Ring Buffer / Drop Policy**: Configurable `max_queue_size` (e.g., default 5,000 events max). If downstream ingestion is slow and the queue fills up, new events are safely dropped with warning/debug metrics rather than causing out-of-memory or blocking the host application.
  - **Manual & Lifecycle Flush**: Expose `flush(): Promise<void>` and `shutdown(): Promise<void>` for manual triggering and graceful process termination hooks.
- Implement HTTP transport in `sdks/node/src/transport/http.ts`:
  - Asynchronous POST to `/v1/events` using Node.js built-in `fetch` or `http.request`.
  - Configurable request timeout (e.g. default 2,000ms).
  - Complete failure isolation: network or server errors are logged at debug level and never bubble up to application code.
- Unit tests in `sdks/node/tests/transport/` and `sdks/node/tests/batching/`:
  - Test count-triggered flush (pushing `max_batch_size` events immediately dispatches a batch).
  - Test time-triggered flush (pushing 3 events dispatches after `flush_interval_ms` without waiting for count threshold).
  - Test queue overflow drop policy.
  - Test graceful `flush()` on demand.

## Allowed Files
- `sdks/node/src/sampling/**`
- `sdks/node/src/batching/**`
- `sdks/node/src/transport/**`
- `sdks/node/tests/batching/**`
- `sdks/node/tests/transport/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-021.md`

## Dependencies
- TASK-020

## Inputs and Outputs
- **Inputs**: Intercepted function execution events from the instrumentation engine.
- **Outputs**: Asynchronous, automatically batched HTTP payloads delivered to `/v1/events`.

## Acceptance Criteria
1. **Count-Trigger**: When `max_batch_size` (e.g. 100) events are buffered, a batch POST is dispatched immediately without waiting for the timer.
2. **Time-Trigger**: When fewer than `max_batch_size` events are buffered, they are automatically flushed once `flush_interval_ms` (e.g. 500ms) expires.
3. **Graceful Flush**: Calling `flush()` flushes all buffered items immediately.
4. **Non-Blocking Timer**: Background timer is created with `.unref()` to avoid hanging process exit.
5. **Safe Overflow**: Exceeding `max_queue_size` drops surplus events safely without exception or memory growth.
6. **Error Isolation**: Failed HTTP network requests never throw unhandled rejections to the host application.
7. Unit tests verify both count-based and time-based auto-batch dispatch behaviors.

## Verification Commands
- `pnpm --filter @eventslog/node test batching`
- `pnpm --filter @eventslog/node test transport`

## Risks and Assumptions
- Use `process.hrtime` or monotonic timer for interval checks to avoid clock skew issues.

## Status
DONE

