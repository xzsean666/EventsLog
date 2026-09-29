-- Migration 001: Initial Schema for EventsLog
-- Creates database eventslog and primary tables for telemetry ingestion

CREATE DATABASE IF NOT EXISTS eventslog;

-- Table for observed function execution traces and metrics
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
    timestamp DateTime64(6, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_name, environment, function_name, timestamp, trace_id, span_id)
SETTINGS index_granularity = 8192,
         parts_to_delay_insert = 300,
         parts_to_throw_insert = 600,
         max_delay_to_insert = 1;

-- Table for generic event envelopes and raw logs
CREATE TABLE IF NOT EXISTS eventslog.events (
    event_id String,
    trace_id String,
    span_id String,
    parent_span_id String DEFAULT '',
    service_name LowCardinality(String),
    environment LowCardinality(String),
    event_type LowCardinality(String),
    payload_json String DEFAULT '',
    timestamp DateTime64(6, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_name, environment, event_type, timestamp, trace_id, span_id)
SETTINGS index_granularity = 8192,
         parts_to_delay_insert = 300,
         parts_to_throw_insert = 600,
         max_delay_to_insert = 1;
