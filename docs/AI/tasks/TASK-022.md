# TASK-022: Node.js SDK Zero-Code Loader & Auto-Registration Hook

## Objective
Implement zero-code registration hooks in `@eventslog/node` allowing developers to run any Node.js application under observation via `node --import @eventslog/node/register app.js` or `node -r @eventslog/node/register app.js` without any business code edits, including automatic graceful flush on process termination.

## Scope
- Implement registration entry point in `sdks/node/src/register.ts`:
  - Automatically loads configuration from `eventslog.yaml` or environment variables.
  - Initializes tracing context, auto-batch buffer, and transport pipeline.
  - Hooks into Node.js module loading (`module.register` for ESM, `require.extensions` for CommonJS) to intercept modules matching configuration rules on load.
  - Registers process termination handlers (`beforeExit`, `SIGINT`, `SIGTERM`) to trigger `batcher.flush()` so buffered events are sent before shutdown.
- Export registration entry points in `package.json` (`./register`).
- Integration tests executing child Node.js processes with `--import` and verifying automatic function instrumentation and auto-flush on exit without touching target scripts.

## Allowed Files
- `sdks/node/src/register.ts`
- `sdks/node/src/loader/**`
- `sdks/node/package.json`
- `sdks/node/tests/integration/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-022.md`

## Dependencies
- TASK-021

## Inputs and Outputs
- **Inputs**: Unmodified Node.js scripts executed with Node CLI registration flags.
- **Outputs**: Fully instrumented application runtime transmitting execution telemetry and flushing batched events on process exit.

## Acceptance Criteria
1. Running `node -r ./sdks/node/register script.js` intercepts configured functions without imports in `script.js`.
2. Target script output is identical to uninstrumented execution.
3. Telemetry events are auto-batched and dispatched.
4. Process termination flushes any remaining buffered events cleanly.
5. Integration tests pass.

## Verification Commands
- `pnpm --filter @eventslog/node test integration`

## Risks and Assumptions
- ESM module customization hooks in Node.js 20+ require proper URL resolution.

## Status
DONE

