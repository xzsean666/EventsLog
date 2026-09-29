# ClickHouse Storage

ClickHouse table schemas, migrations, and local Docker development configuration for EventsLog.

- `migrations/`: Versioned SQL migration files (`001_initial_schema.sql`, etc.)
- `schema/`: Canonical schema definitions for `events` and `function_executions` tables.
- `docker-compose.yml`: Local ClickHouse setup for development.
