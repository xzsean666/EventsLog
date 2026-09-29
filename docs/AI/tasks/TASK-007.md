# TASK-007: ClickHouse Schema, Docker Optimization & Production Configurations

## Objective
Establish ClickHouse table schemas, versioned migrations, local container orchestration, and production-grade optimization configurations strictly adhering to `docs/ClickHouse-Docker-Optimization.md`. Defend against system log explosion (`query_log`, `part_log`, `trace_log`) and write backpressure ("Too many parts" code 252).

## Scope
- Implement Docker container orchestration in `storage/clickhouse/docker-compose.yml`:
  - `ulimits.nofile`: soft & hard set to `262144` to prevent "Too many open files" crashes.
  - Read-only config directory mounts:
    - `./config.d:/etc/clickhouse-server/config.d:ro`
    - `./users.d:/etc/clickhouse-server/users.d:ro`
    - `./data:/var/lib/clickhouse`
    - `./logs:/var/log/clickhouse-server`
  - Docker container logging driver: `json-file` with `max-size: 50m` and `max-file: 3`.
  - Healthcheck command: `wget -qO- http://127.0.0.1:8123/ping | grep -q Ok`.
- Generate server XML configuration files:
  - `storage/clickhouse/config.d/system_logs.xml`:
    - `query_log`: TTL `event_date + INTERVAL 2 DAY DELETE`, flush interval 7500ms, max_size_rows 1048576.
    - `<trace_log remove="1"/>`: disable trace logging to reclaim disk space.
    - `part_log`: TTL `event_date + INTERVAL 1 DAY DELETE`.
    - `text_log`, `metric_log`, `asynchronous_metric_log`: TTL 2 days.
    - `background_pool_size`: 16 (boost merge concurrency).
    - `merge_tree`: `parts_to_delay_insert: 300`, `parts_to_throw_insert: 600`, `max_delay_to_insert: 1`.
  - `storage/clickhouse/users.d/tuning.xml`:
    - `async_insert: 1`: enable native asynchronous memory aggregation.
    - `wait_for_async_insert: 1`: ensure synchronous disk write acknowledgment.
    - `async_insert_busy_timeout_ms: 200`: 200ms batch flush timeout.
    - `async_insert_max_data_size: 10485760`: 10MB memory buffer limit.
    - `log_queries: 0`: prevent high-frequency telemetry INSERT operations from polluting `system.query_log`.
    - `parts_to_delay_insert: 300`, `parts_to_throw_insert: 600`, `max_delay_to_insert: 1`.
- Implement ClickHouse DDL migration in `storage/clickhouse/migrations/001_initial_schema.sql`:
  - `function_executions` table using `ReplacingMergeTree` or `MergeTree`.
  - Monthly partitioning: `PARTITION BY toYYYYMM(timestamp)` (strictly avoiding daily partition explosion).
  - Explicit table settings:
    ```sql
    SETTINGS index_granularity = 8192,
             parts_to_delay_insert = 300,
             parts_to_throw_insert = 600,
             max_delay_to_insert = 1;
    ```
  - Minimize Nullable columns, using empty string `''` or `0` defaults where possible to reduce storage mask overhead.
- Provide maintenance & diagnostic scripts in `storage/clickhouse/scripts/`:
  - `diagnose_parts.sql`: Query active parts and table sizes.
  - `truncate_system_logs.sql`: Emergency space reclamation script.
  - `apply_migrations.sh`: Automated migration runner.

## Allowed Files
- `storage/clickhouse/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-007.md`

## Dependencies
- TASK-004

## Inputs and Outputs
- **Inputs**: Guidelines in `docs/ClickHouse-Docker-Optimization.md` and schema definitions from `crates/schema`.
- **Outputs**: Fully optimized ClickHouse Docker setup, server XML configs, DDL migrations, and diagnostic SQL scripts.

## Acceptance Criteria
1. `docker-compose.yml` configures `ulimits.nofile: 262144`, container log rotation (`50m/3`), healthcheck, and read-only config mounts.
2. `config.d/system_logs.xml` configures 1-2 day log TTL truncation and removes `trace_log`.
3. `users.d/tuning.xml` enables `async_insert=1`, `wait_for_async_insert=1`, `log_queries=0`, and relaxed merge thresholds (`300/600`).
4. `001_initial_schema.sql` applies monthly partitioning and table-level `parts_to_delay_insert = 300`, `parts_to_throw_insert = 600`.
5. Diagnostic scripts (`diagnose_parts.sql`, `truncate_system_logs.sql`) are present and valid SQL.

## Verification Commands
- `bash -n storage/clickhouse/apply_migrations.sh`
- XML syntax check on `storage/clickhouse/config.d/*.xml` and `storage/clickhouse/users.d/*.xml`
- SQL syntax check on `storage/clickhouse/migrations/001_initial_schema.sql`

## Risks and Assumptions
- Config files must be strictly read-only mounted inside the container.

## Status
DONE
