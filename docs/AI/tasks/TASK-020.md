# TASK-020: Node.js SDK Instrumentation Engine & Method Interceptors

## Objective
Implement dynamic function and method wrapping in `@eventslog/node` to observe synchronous and asynchronous function executions without requiring code changes to the target functions.

## Scope
- Implement function wrapper in `sdks/node/src/instrumentation/wrapper.rs` (or `.ts`):
  - Wraps synchronous functions and `async` / Promise-returning functions.
  - Measures high-resolution duration (`process.hrtime.bigint()`).
  - Records input arguments, output result, execution status (`Success` or `Error`).
  - Catches thrown errors or rejected promises without suppressing them (re-throws accurately).
  - Integrates with `TraceContext` to establish parent-child span hierarchy.
- Implement module/class patching in `sdks/node/src/instrumentation/patcher.ts`:
  - Iterates exported functions, class prototypes, and methods matching configuration rules.
  - Avoids double-wrapping previously instrumented targets.
- Unit tests verifying sync, async, and erroring function interception.

## Allowed Files
- `sdks/node/src/instrumentation/**`
- `sdks/node/tests/instrumentation/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-020.md`

## Dependencies
- TASK-019

## Inputs and Outputs
- **Inputs**: Target classes and functions matching inclusion rules.
- **Outputs**: Wrapped functions emitting execution records to the collector pipeline.

## Acceptance Criteria
1. Target function return values and exceptions are identical to uninstrumented behavior.
2. Async functions resolve and reject with intact promises.
3. Errors thrown by business functions are captured and re-thrown cleanly.
4. Unit tests pass.

## Verification Commands
- `pnpm --filter @eventslog/node test instrumentation`

## Risks and Assumptions
- Function properties (`length`, `name`) and prototype chains must be preserved during wrapping.

## Status
DONE

