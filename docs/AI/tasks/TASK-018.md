# TASK-018: Node.js SDK Tracing Context & AsyncLocalStorage

## Objective
Implement asynchronous context propagation in `@eventslog/node` using Node.js standard `AsyncLocalStorage`, managing active Trace IDs, Span IDs, and Parent Span IDs across asynchronous function boundaries.

## Scope
- Implement context manager in `sdks/node/src/tracing/context.ts`:
  - `TraceContext` interface (`traceId: string`, `spanId: string`, `parentSpanId?: string`).
  - `AsyncLocalStorage<TraceContext>` instance.
  - Helper functions: `currentContext()`, `runWithContext(ctx, fn)`, `createChildSpan()`.
- Implement ID generators using standard UUID or random hexadecimal IDs.
- Unit tests verifying context persistence across `await`, promises, `setTimeout`, and EventEmitter callbacks.

## Allowed Files
- `sdks/node/src/tracing/**`
- `sdks/node/tests/tracing/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-018.md`

## Dependencies
- TASK-016

## Inputs and Outputs
- **Inputs**: Nested asynchronous executions.
- **Outputs**: Accurate parent-child span linkages across arbitrary async boundaries.

## Acceptance Criteria
1. Context reliably propagates across `async/await` and nested calls.
2. Parent span ID accurately points to the caller function's span ID.
3. Unit tests pass with asynchronous test cases.

## Verification Commands
- `pnpm --filter @eventslog/node test tracing`

## Risks and Assumptions
- Ensure zero memory leaks by relying on native V8 `AsyncLocalStorage` garbage collection.

## Status
DONE

