-- Emergency space reclamation: truncate explosive ClickHouse system tables
TRUNCATE TABLE IF EXISTS system.query_log;
TRUNCATE TABLE IF EXISTS system.part_log;
TRUNCATE TABLE IF EXISTS system.trace_log;
TRUNCATE TABLE IF EXISTS system.text_log;
TRUNCATE TABLE IF EXISTS system.metric_log;
TRUNCATE TABLE IF EXISTS system.asynchronous_metric_log;
