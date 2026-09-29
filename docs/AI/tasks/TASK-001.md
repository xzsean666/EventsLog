# TASK-001: Monorepo Foundation & Root Workspace Configuration

## Objective
Establish the foundational monorepo workspace configurations for both Rust (`Cargo.toml`) and Node.js (`package.json`, `pnpm-workspace.yaml`), along with repository hygiene files (`.gitignore`, `README.md`, `LICENSE`).

## Scope
- Create root `Cargo.toml` configured as a virtual workspace with shared dependencies/profiles.
- Initialize `crates/protocol` member crate skeleton (`Cargo.toml`, `src/lib.rs`) so that the Cargo virtual workspace has a valid member.
- Create root `package.json` and `pnpm-workspace.yaml` configuring workspace packages (`sdks/*`, `dashboard`, `packages/*`, `examples/*`).
- Create comprehensive `.gitignore` for Rust, Node, TypeScript, ClickHouse, and IDE artifacts.
- Create `README.md` explaining the EventsLog vision, product model, repository structure, and getting started guide.
- Create `LICENSE` (Apache-2.0).

## Allowed Files
- `/ssd0/git/EventsLog/Cargo.toml`
- `/ssd0/git/EventsLog/package.json`
- `/ssd0/git/EventsLog/pnpm-workspace.yaml`
- `/ssd0/git/EventsLog/.gitignore`
- `/ssd0/git/EventsLog/README.md`
- `/ssd0/git/EventsLog/LICENSE`
- `/ssd0/git/EventsLog/crates/protocol/Cargo.toml`
- `/ssd0/git/EventsLog/crates/protocol/src/lib.rs`
- `/ssd0/git/EventsLog/docs/AI/SESSION_STATE.md`
- `/ssd0/git/EventsLog/docs/AI/TASK_INDEX.md`
- `/ssd0/git/EventsLog/docs/AI/tasks/TASK-001.md`

## Dependencies
None.

## Inputs and Outputs
- **Inputs**: Architecture specifications in `docs/AI/ARCHITECTURE.md`.
- **Outputs**: Verified root workspace configurations enabling Cargo and pnpm commands across the repository.

## Acceptance Criteria
1. `Cargo.toml` correctly sets up the virtual workspace with resolver version 2 and common workspace package/dependency settings.
2. `cargo metadata --format-version 1` runs successfully.
3. `package.json` and `pnpm-workspace.yaml` define workspace packages cleanly.
4. `.gitignore` prevents staging build outputs (`target/`, `node_modules/`, `dist/`), local environment files (`.env*`), and editor configs.
5. `README.md` clearly reflects the EventsLog zero-code function observability architecture.
6. `LICENSE` is present with Apache License 2.0.

## Verification Commands
- `cargo metadata --format-version 1`
- `pnpm install`
- `git status --short`

## Risks and Assumptions
- Cargo may fail if workspace member glob matches nothing without directories existing or if members are not yet initialized. We will verify `cargo metadata` behavior and create directory placeholders if necessary.

## Status
DONE
