# TASK-002: Multi-Language Directory Isolation & Comprehensive Task Roadmap Specification

## Objective
Establish the directory skeleton across the monorepo for all client SDKs, shared Rust crates, backend services, ClickHouse storage, dashboard, and examples, enforcing strict language and architectural boundaries. Concurrently, generate the complete, exhaustive task breakdown for the entire EventsLog system (`TASK-001` through `TASK-025`).

## Scope
- Create SDK directories:
  - `sdks/node/` (Node.js / TypeScript SDK - Primary Target)
  - `sdks/browser/` (Browser JS/TS SDK - Future)
  - `sdks/python/` (Python SDK - Future)
  - `sdks/go/` (Go SDK - Future)
  - `sdks/java/` (Java SDK - Future)
  - `sdks/rust/` (Rust SDK - Future)
- Create Rust shared crates placeholder directories:
  - `crates/schema/`
  - `crates/config/`
  - `crates/common/`
- Create Rust backend services placeholder directories:
  - `services/ingestion/`
  - `services/query/`
  - `services/api/`
- Create ClickHouse storage directory:
  - `storage/clickhouse/migrations/`
  - `storage/clickhouse/schema/`
- Create dashboard and shared frontend package directories:
  - `dashboard/`
  - `packages/ui/`
  - `packages/config/`
- Create examples directory:
  - `examples/node/`
- Add explanatory `README.md` to each subsystem defining its language ecosystem, dependencies, and boundary rules (ensuring SDK code never mixes with Rust backend crates).
- Update `docs/AI/TASK_INDEX.md` with complete 25-task index.
- Author all task specifications from `docs/AI/tasks/TASK-003.md` through `docs/AI/tasks/TASK-025.md`.

## Allowed Files
- `sdks/**`
- `crates/**`
- `services/**`
- `storage/**`
- `dashboard/**`
- `packages/**`
- `examples/**`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/tasks/**`

## Dependencies
- TASK-001 (Completed)

## Inputs and Outputs
- **Inputs**: User prompt request, `docs/AI/ARCHITECTURE.md`.
- **Outputs**: Verified directory structure with boundary docs and full 25-task roadmap files.

## Acceptance Criteria
1. All SDK directories exist under `sdks/` (`node`, `browser`, `python`, `go`, `java`, `rust`) with language isolation guidelines.
2. Backend directories (`crates/`, `services/`, `storage/`) exist and maintain clean isolation.
3. `docs/AI/TASK_INDEX.md` contains all 25 fine-grained tasks.
4. Each `TASK-xxx.md` from `TASK-001` through `TASK-025` is written with complete specification sections.
5. Workspace commands (`cargo check --workspace`, `pnpm install`) continue to succeed without errors.

## Verification Commands
- `ls -d sdks/*/ crates/*/ services/*/ storage/*/ dashboard/ packages/*/ examples/*/`
- `ls -1 docs/AI/tasks/TASK-*.md | wc -l`
- `cargo check --workspace`
- `pnpm install`

## Risks and Assumptions
- Subsystem directories without active package managers must not trigger build failures in Cargo or pnpm.

## Status
DONE
