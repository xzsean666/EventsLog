use chrono::{DateTime, Utc};
use eventslog_query::{ExecutionFilter, FunctionFilter, FunctionSummary, StatsResponse};
use eventslog_schema::ExecutionRow;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::{Arc, Mutex};
use thiserror::Error;

/// Storage errors originating from the SQLite engine.
#[derive(Debug, Error)]
pub enum StorageError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Blocking task join error: {0}")]
    TaskJoin(#[from] tokio::task::JoinError),
    #[error("Invalid timestamp: {0}")]
    InvalidTimestamp(String),
}

/// SQLite-backed persistent storage for local development and debugging.
#[derive(Clone)]
pub struct SqliteStorage {
    conn: Arc<Mutex<Connection>>,
    db_path: String,
}

impl SqliteStorage {
    /// Opens or creates a SQLite database at the specified path and initializes the schema.
    /// If `path` is `":memory:"`, an in-memory database is used.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, StorageError> {
        let path_str = path.as_ref().to_string_lossy().to_string();
        let conn = if path_str == ":memory:" {
            Connection::open_in_memory()?
        } else {
            if let Some(parent) = path.as_ref().parent() {
                if !parent.as_os_str().is_empty() {
                    let _ = std::fs::create_dir_all(parent);
                }
            }
            let conn = Connection::open(&path)?;
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA busy_timeout = 5000;",
            )?;
            conn
        };

        let storage = Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: path_str,
        };

        storage.init_schema()?;
        Ok(storage)
    }

    /// Convenience constructor for an in-memory SQLite storage (ideal for tests).
    pub fn open_in_memory() -> Result<Self, StorageError> {
        Self::open(":memory:")
    }

    /// Returns the database path or `":memory:"`.
    pub fn db_path(&self) -> &str {
        &self.db_path
    }

    /// Initializes schema tables and indexes.
    fn init_schema(&self) -> Result<(), StorageError> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS executions (
                event_id TEXT PRIMARY KEY,
                trace_id TEXT NOT NULL,
                span_id TEXT NOT NULL,
                parent_span_id TEXT NOT NULL DEFAULT '',
                service_name TEXT NOT NULL,
                environment TEXT NOT NULL,
                module_name TEXT NOT NULL,
                class_name TEXT NOT NULL DEFAULT '',
                function_name TEXT NOT NULL,
                file_path TEXT NOT NULL DEFAULT '',
                line_number INTEGER NOT NULL DEFAULT 0,
                input_json TEXT NOT NULL DEFAULT '',
                output_json TEXT NOT NULL DEFAULT '',
                duration_ms REAL NOT NULL DEFAULT 0.0,
                duration_nanos INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'ok',
                error_type TEXT NOT NULL DEFAULT '',
                error_message TEXT NOT NULL DEFAULT '',
                error_stack TEXT NOT NULL DEFAULT '',
                attributes_json TEXT NOT NULL DEFAULT '',
                timestamp TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_exec_fn ON executions(service_name, environment, function_name);
            CREATE INDEX IF NOT EXISTS idx_exec_trace ON executions(trace_id);
            CREATE INDEX IF NOT EXISTS idx_exec_span ON executions(span_id);
            CREATE INDEX IF NOT EXISTS idx_exec_time ON executions(timestamp);",
        )?;
        Ok(())
    }

    /// Inserts a batch of ExecutionRows in a single transaction.
    pub async fn insert_executions(&self, rows: Vec<ExecutionRow>) -> Result<usize, StorageError> {
        if rows.is_empty() {
            return Ok(0);
        }

        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let mut conn = conn.lock().unwrap();
            let tx = conn.transaction()?;
            let count = rows.len();

            {
                let mut stmt = tx.prepare_cached(
                    "INSERT OR REPLACE INTO executions (
                        event_id, trace_id, span_id, parent_span_id, service_name, environment,
                        module_name, class_name, function_name, file_path, line_number,
                        input_json, output_json, duration_ms, duration_nanos, status,
                        error_type, error_message, error_stack, attributes_json, timestamp
                    ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6,
                        ?7, ?8, ?9, ?10, ?11,
                        ?12, ?13, ?14, ?15, ?16,
                        ?17, ?18, ?19, ?20, ?21
                    )",
                )?;

                for row in rows {
                    let ts_str = row.timestamp.to_rfc3339();
                    stmt.execute(params![
                        row.event_id,
                        row.trace_id,
                        row.span_id,
                        row.parent_span_id,
                        row.service_name,
                        row.environment,
                        row.module_name,
                        row.class_name,
                        row.function_name,
                        row.file_path,
                        row.line_number,
                        row.input_json,
                        row.output_json,
                        row.duration_ms,
                        row.duration_nanos as i64,
                        row.status,
                        row.error_type,
                        row.error_message,
                        row.error_stack,
                        row.attributes_json,
                        ts_str,
                    ])?;
                }
            }

            tx.commit()?;
            Ok(count)
        })
        .await?
    }

    /// Lists aggregated function summaries matching the specified filter.
    pub async fn list_functions(&self, filter: &FunctionFilter) -> Result<Vec<FunctionSummary>, StorageError> {
        let conn = self.conn.clone();
        let service = filter.service_name.clone();
        let env = filter.environment.clone();
        let search = filter.search.clone();
        let limit = filter.limit.unwrap_or(100).min(1000) as i64;

        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare_cached(
                "SELECT
                    service_name || ':' || module_name || ':' || function_name AS function_id,
                    service_name,
                    module_name,
                    MAX(class_name) AS class_name,
                    function_name,
                    COUNT(*) AS call_count,
                    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count,
                    AVG(duration_ms) AS avg_duration_ms,
                    MAX(timestamp) AS last_seen
                FROM executions
                WHERE (?1 IS NULL OR service_name = ?1)
                  AND (?2 IS NULL OR environment = ?2)
                  AND (?3 IS NULL OR function_name LIKE '%' || ?3 || '%' OR module_name LIKE '%' || ?3 || '%')
                GROUP BY service_name, module_name, function_name
                ORDER BY call_count DESC
                LIMIT ?4",
            )?;

            let rows = stmt.query_map(
                params![service, env, search, limit],
                |row| {
                    let function_id: String = row.get(0)?;
                    let service_name: String = row.get(1)?;
                    let module_name: String = row.get(2)?;
                    let class_name_raw: Option<String> = row.get(3)?;
                    let function_name: String = row.get(4)?;
                    let call_count: i64 = row.get(5)?;
                    let error_count: i64 = row.get(6)?;
                    let avg_duration_ms: f64 = row.get(7)?;
                    let last_seen_str: String = row.get(8)?;

                    let class_name = match class_name_raw {
                        Some(ref s) if !s.is_empty() => Some(s.clone()),
                        _ => None,
                    };

                    let last_seen = DateTime::parse_from_rfc3339(&last_seen_str)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now());

                    Ok(FunctionSummary {
                        function_id,
                        service_name,
                        module_name: module_name.clone(),
                        module: module_name,
                        class_name,
                        function_name,
                        call_count: call_count as u64,
                        total_executions: call_count as u64,
                        error_count: error_count as u64,
                        total_errors: error_count as u64,
                        avg_duration_ms,
                        last_seen,
                    })
                },
            )?;

            let mut results = Vec::new();
            for r in rows {
                results.push(r?);
            }
            Ok(results)
        })
        .await?
    }

    /// Lists individual execution records matching the filter.
    pub async fn list_executions(&self, filter: &ExecutionFilter) -> Result<Vec<ExecutionRow>, StorageError> {
        let conn = self.conn.clone();
        let service = filter.service_name.clone();
        let env = filter.environment.clone();
        let func = filter.function_name.clone();
        let status = filter.status.clone();
        let trace = filter.trace_id.clone();
        let limit = filter.limit.unwrap_or(50).min(500) as i64;
        let offset = filter.offset.unwrap_or(0) as i64;

        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare_cached(
                "SELECT
                    event_id, trace_id, span_id, parent_span_id, service_name, environment,
                    module_name, class_name, function_name, file_path, line_number,
                    input_json, output_json, duration_ms, duration_nanos, status,
                    error_type, error_message, error_stack, attributes_json, timestamp
                FROM executions
                WHERE (?1 IS NULL OR service_name = ?1)
                  AND (?2 IS NULL OR environment = ?2)
                  AND (?3 IS NULL OR function_name = ?3)
                  AND (?4 IS NULL OR status = ?4)
                  AND (?5 IS NULL OR trace_id = ?5)
                ORDER BY timestamp DESC
                LIMIT ?6 OFFSET ?7",
            )?;

            let rows = stmt.query_map(
                params![service, env, func, status, trace, limit, offset],
                map_execution_row,
            )?;

            let mut results = Vec::new();
            for r in rows {
                results.push(r?);
            }
            Ok(results)
        })
        .await?
    }

    /// Retrieves an execution by event_id or span_id.
    pub async fn get_execution(&self, id: String) -> Result<Option<ExecutionRow>, StorageError> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare_cached(
                "SELECT
                    event_id, trace_id, span_id, parent_span_id, service_name, environment,
                    module_name, class_name, function_name, file_path, line_number,
                    input_json, output_json, duration_ms, duration_nanos, status,
                    error_type, error_message, error_stack, attributes_json, timestamp
                FROM executions
                WHERE event_id = ?1 OR span_id = ?1
                LIMIT 1",
            )?;

            let row = stmt.query_row(params![id], map_execution_row).optional()?;
            Ok(row)
        })
        .await?
    }

    /// Retrieves all execution spans associated with a trace_id.
    pub async fn get_trace_spans(&self, trace_id: String) -> Result<Vec<ExecutionRow>, StorageError> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare_cached(
                "SELECT
                    event_id, trace_id, span_id, parent_span_id, service_name, environment,
                    module_name, class_name, function_name, file_path, line_number,
                    input_json, output_json, duration_ms, duration_nanos, status,
                    error_type, error_message, error_stack, attributes_json, timestamp
                FROM executions
                WHERE trace_id = ?1
                ORDER BY timestamp ASC",
            )?;

            let rows = stmt.query_map(params![trace_id], map_execution_row)?;
            let mut results = Vec::new();
            for r in rows {
                results.push(r?);
            }
            Ok(results)
        })
        .await?
    }

    /// Computes platform overview statistics matching StatsResponse.
    pub async fn get_stats(
        &self,
        service_name: Option<String>,
        environment: Option<String>,
    ) -> Result<StatsResponse, StorageError> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock().unwrap();
            let mut stmt = conn.prepare_cached(
                "SELECT
                    COUNT(*) AS total_executions,
                    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS total_errors
                FROM executions
                WHERE (?1 IS NULL OR service_name = ?1)
                  AND (?2 IS NULL OR environment = ?2)",
            )?;

            let (total_executions, total_errors): (i64, i64) = stmt.query_row(
                params![service_name, environment],
                |row| {
                    let total: i64 = row.get(0)?;
                    let errors: i64 = row.get::<_, Option<i64>>(1)?.unwrap_or(0);
                    Ok((total, errors))
                },
            )?;

            let total_executions = total_executions as u64;
            let total_errors = total_errors as u64;
            let error_rate = if total_executions > 0 {
                (total_errors as f64) / (total_executions as f64)
            } else {
                0.0
            };

            // Query sorted durations to compute accurate percentiles (p50, p95, p99)
            let mut dur_stmt = conn.prepare_cached(
                "SELECT duration_ms FROM executions
                 WHERE (?1 IS NULL OR service_name = ?1)
                   AND (?2 IS NULL OR environment = ?2)
                 ORDER BY duration_ms ASC",
            )?;

            let durations: Vec<f64> = dur_stmt
                .query_map(params![service_name, environment], |r| r.get(0))?
                .filter_map(|r| r.ok())
                .collect();

            let (p50, p95, p99) = if durations.is_empty() {
                (0.0, 0.0, 0.0)
            } else {
                let n = durations.len();
                let p50_idx = ((n as f64) * 0.50).floor() as usize;
                let p95_idx = ((n as f64) * 0.95).floor() as usize;
                let p99_idx = ((n as f64) * 0.99).floor() as usize;
                (
                    durations[p50_idx.min(n - 1)],
                    durations[p95_idx.min(n - 1)],
                    durations[p99_idx.min(n - 1)],
                )
            };

            Ok(StatsResponse {
                total_executions,
                total_errors,
                error_rate,
                p50_duration_ms: p50,
                p95_duration_ms: p95,
                p99_duration_ms: p99,
            })
        })
        .await?
    }
}

fn map_execution_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ExecutionRow> {
    let event_id: String = row.get(0)?;
    let trace_id: String = row.get(1)?;
    let span_id: String = row.get(2)?;
    let parent_span_id: String = row.get(3)?;
    let service_name: String = row.get(4)?;
    let environment: String = row.get(5)?;
    let module_name: String = row.get(6)?;
    let class_name: String = row.get(7)?;
    let function_name: String = row.get(8)?;
    let file_path: String = row.get(9)?;
    let line_number: u32 = row.get(10)?;
    let input_json: String = row.get(11)?;
    let output_json: String = row.get(12)?;
    let duration_ms: f64 = row.get(13)?;
    let duration_nanos: i64 = row.get(14)?;
    let status: String = row.get(15)?;
    let error_type: String = row.get(16)?;
    let error_message: String = row.get(17)?;
    let error_stack: String = row.get(18)?;
    let attributes_json: String = row.get(19)?;
    let ts_str: String = row.get(20)?;

    let timestamp = DateTime::parse_from_rfc3339(&ts_str)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());

    Ok(ExecutionRow {
        event_id,
        trace_id,
        span_id,
        parent_span_id,
        service_name,
        environment,
        module_name,
        class_name,
        function_name,
        file_path,
        line_number,
        input_json,
        output_json,
        duration_ms,
        duration_nanos: duration_nanos as u64,
        status,
        error_type,
        error_message,
        error_stack,
        attributes_json,
        timestamp,
    })
}
