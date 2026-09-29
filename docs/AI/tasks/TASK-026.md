# TASK-026: Comprehensive Audit Remediation: API Contract Alignment, SDK Robustness, Server Config & Storage Hardening

## Objective
Address critical and high-priority findings discovered during the comprehensive system audit:
1. Align Backend Query API and Dashboard API contracts to eliminate schema mismatches and remove dependence on mock fallback.
2. Fix Node.js SDK class constructor interception bug preventing `TypeError` on class instantiation and ensuring static methods are instrumented.
3. Fix SDK execution timing distortion by measuring elapsed time strictly around user function invocation.
4. Implement environment variable configuration loading across all backend services (`ingestion`, `query`, `api`).
5. Enhance ClickHouse storage schema with Bloom filter skipping index for `trace_id` and automatic TTL data retention.
6. Harden trace tree reconstruction against cyclic and self-referential parent spans.

## Scope
- `crates/config/src/server.rs`: Add environment variable configuration parser (`from_env`).
- `services/ingestion/src/main.rs`: Load configuration from environment.
- `services/query/src/main.rs`: Load configuration from environment.
- `services/api/src/main.rs`: Load configuration from environment.
- `services/query/src/storage/client.rs`: Enrich `FunctionSummary` with `function_id`, `module`, `total_executions`, and `total_errors` to align with Frontend DTOs.
- `services/query/src/handlers/traces.rs`: Structure trace response to match frontend expectations (`TraceTree` / `root_spans`), handle cyclic/self-referential spans cleanly.
- `services/query/src/handlers/stats.rs`: Ensure compatibility with dashboard stats response envelope (`{ stats: ... }`).
- `services/query/src/handlers/executions.rs`: Ensure compatibility with execution detail query.
- `sdks/node/src/instrumentation/patcher.ts`: Detect ES classes safely to prevent wrapping constructors with `fn.apply`, and properly patch static methods.
- `sdks/node/src/instrumentation/wrapper.ts`: Capture start timestamp immediately prior to `fn.apply` to exclude SDK serialization overhead.
- `sdks/node/src/register.ts`: Ensure graceful termination flushing with bounded timeout.
- `dashboard/src/api/client.ts`: Align API response parsing, disable fallback by default.
- `storage/clickhouse/migrations/001_initial_schema.sql`: Add Bloom filter index on `trace_id` and 30-day retention TTL.
- `docs/AI/SESSION_STATE.md`: Update session state.
- `docs/AI/TASK_INDEX.md`: Register TASK-026.

## Allowed Files
- `crates/config/**`
- `services/ingestion/**`
- `services/query/**`
- `services/api/**`
- `sdks/node/**`
- `dashboard/**`
- `storage/clickhouse/**`
- `docs/AI/**`

## Dependencies
- TASK-025

## Inputs and Outputs
- **Inputs**: Audit findings across backend, SDK, storage, and frontend.
- **Outputs**: Production-hardened codebase with aligned contracts, safe instrumentation, configurable services, and optimized queries.

## Acceptance Criteria
1. All Rust unit and integration tests pass (`cargo test --workspace`).
2. All Node.js SDK and Dashboard Vitest tests pass (`pnpm -r run test`).
3. Instantiating classes instrumented by `@eventslog/node` works with `new` without throwing `TypeError`.
4. Backend services read `PORT`, `HOST`, `CLICKHOUSE_URL`, `API_KEY` from environment variables.
5. Query API responses can be parsed directly by Dashboard API client without fallback mode.
6. E2E verification script executes and passes successfully.

## Verification Commands
- `cargo test --workspace`
- `pnpm -r run test`
- `pnpm run build`
- `bash scripts/test_e2e.sh`

## Risks and Assumptions
- Keep changes minimal and backward-compatible with existing test suites.

## Status
DONE

