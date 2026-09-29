#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# EventsLog Flutter / Dart Real-World End-to-End Verification Runner
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "================================================================================"
echo " Starting EventsLog Flutter / Dart Real-World End-to-End Verification Suite..."
echo " Root directory: ${ROOT_DIR}"
echo "================================================================================"

# 1. Compile Rust backend services
echo "--> [1/4] Compiling EventsLog Ingestion & Query services..."
cargo build -p eventslog-ingestion -p eventslog-query --quiet

# 2. Build SDK packages
echo "--> [2/4] Building SDK package (@eventslog/flutter)..."
pnpm --filter @eventslog/flutter run build > /dev/null

# 3. Ensure ClickHouse Database & Schema are up to date
echo "--> [3/4] Ensuring ClickHouse database and tables are provisioned..."
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://eventlake:eventlake@127.0.0.1:8123}"

curl -s -f -X POST "${CLICKHOUSE_URL}/" --data-binary "CREATE DATABASE IF NOT EXISTS eventslog;" > /dev/null

curl -s -f -X POST "${CLICKHOUSE_URL}/" --data-binary "
CREATE TABLE IF NOT EXISTS eventslog.function_executions (
    event_id String,
    trace_id String,
    span_id String,
    parent_span_id String DEFAULT '',
    service_name LowCardinality(String),
    environment LowCardinality(String),
    module_name LowCardinality(String),
    class_name LowCardinality(String) DEFAULT '',
    function_name LowCardinality(String),
    file_path String DEFAULT '',
    line_number UInt32 DEFAULT 0,
    input_json String DEFAULT '',
    output_json String DEFAULT '',
    duration_ms Float64,
    duration_nanos UInt64,
    status LowCardinality(String),
    error_type LowCardinality(String) DEFAULT '',
    error_message String DEFAULT '',
    error_stack String DEFAULT '',
    attributes_json String DEFAULT '',
    timestamp DateTime64(6, 'UTC'),
    INDEX idx_trace trace_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_span span_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_event event_id TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_name, environment, function_name, timestamp, trace_id, span_id)
TTL toDateTime(timestamp) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192,
         parts_to_delay_insert = 300,
         parts_to_throw_insert = 600,
         max_delay_to_insert = 1;
" > /dev/null

curl -s -f -X POST "${CLICKHOUSE_URL}/" --data-binary "
CREATE TABLE IF NOT EXISTS eventslog.events (
    event_id String,
    trace_id String,
    span_id String,
    parent_span_id String DEFAULT '',
    service_name LowCardinality(String),
    environment LowCardinality(String),
    event_type LowCardinality(String),
    payload_json String DEFAULT '',
    timestamp DateTime64(6, 'UTC'),
    INDEX idx_events_trace trace_id TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_name, environment, event_type, timestamp, trace_id, span_id)
TTL toDateTime(timestamp) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192,
         parts_to_delay_insert = 300,
         parts_to_throw_insert = 600,
         max_delay_to_insert = 1;
" > /dev/null

echo "    [OK] ClickHouse schema ready."

# 4. Run Flutter / Dart E2E Suite
echo "--> [4/4] Executing Flutter / Dart Full-Stack E2E Test..."
cd "${ROOT_DIR}/tests/e2e"
pnpm run build
CLICKHOUSE_URL="${CLICKHOUSE_URL}" node dist/flutter_e2e.js

echo "================================================================================"
echo " FLUTTER / DART FULL-STACK E2E VERIFICATION COMPLETED WITH 100% SUCCESS!"
echo "================================================================================"
