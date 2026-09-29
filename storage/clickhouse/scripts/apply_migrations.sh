#!/usr/bin/env bash
set -euo pipefail

CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(cd "${SCRIPT_DIR}/../migrations" && pwd)"

echo "==> Applying ClickHouse migrations against ${CLICKHOUSE_URL}"

# Wait for ClickHouse ping endpoint
MAX_RETRIES=30
RETRY_COUNT=0
until curl -s "${CLICKHOUSE_URL}/ping" | grep -q "Ok"; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ "${RETRY_COUNT}" -ge "${MAX_RETRIES}" ]; then
        echo "Error: ClickHouse did not become ready at ${CLICKHOUSE_URL} within timeout."
        exit 1
    fi
    echo "Waiting for ClickHouse to be ready... (${RETRY_COUNT}/${MAX_RETRIES})"
    sleep 1
done

echo "==> ClickHouse is healthy. Executing migrations..."

for sql_file in $(find "${MIGRATIONS_DIR}" -name "*.sql" | sort); do
    echo "Applying migration: $(basename "${sql_file}")..."
    # ClickHouse HTTP interface accepts queries via POST body
    RESPONSE=$(curl -sS -X POST "${CLICKHOUSE_URL}/" --data-binary @"${sql_file}")
    if [ -n "${RESPONSE}" ]; then
        echo "Output: ${RESPONSE}"
    fi
    echo "✓ Applied $(basename "${sql_file}") successfully"
done

echo "==> All migrations applied successfully."
