# TASK-016: Node.js SDK Project Setup, Build & Protocol Types

## Objective
Establish the package structure, build toolchain (TypeScript / tsup / vitest), and TypeScript protocol type definitions in `sdks/node` matching the canonical protocol in `crates/protocol`.

## Scope
- Create `sdks/node/package.json` with `@eventslog/node` package name, exports, scripts (`build`, `test`, `lint`).
- Create `sdks/node/tsconfig.json` targeting ES2022 with declarations.
- Define TypeScript protocol types in `sdks/node/src/protocol/types.ts`:
  - `Event`, `EventType`, `FunctionIdentity`, `FunctionExecution`, `ExecutionStatus`, `ExecutionError`.
- Set up unit test runner (Vitest) and basic type check tests.

## Allowed Files
- `sdks/node/package.json`
- `sdks/node/tsconfig.json`
- `sdks/node/src/protocol/**`
- `sdks/node/src/index.ts`
- `sdks/node/tests/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-016.md`

## Dependencies
- TASK-001
- TASK-002

## Inputs and Outputs
- **Inputs**: Canonical protocol definitions from `crates/protocol`.
- **Outputs**: Compiling `@eventslog/node` TypeScript package with typed protocol interfaces.

## Acceptance Criteria
1. `pnpm --filter @eventslog/node build` compiles `.ts` to `.js` and `.d.ts`.
2. `pnpm --filter @eventslog/node test` executes unit tests cleanly.
3. TypeScript definitions match Rust `eventslog-protocol` structs.

## Verification Commands
- `pnpm --filter @eventslog/node run build`
- `pnpm --filter @eventslog/node run test`

## Risks and Assumptions
- Keep runtime dependencies minimal to avoid polluting user applications.

## Status
DONE
