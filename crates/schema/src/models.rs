use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Deserializes a DateTime<Utc> from either standard RFC 3339 or ClickHouse DateTime64 text formats.
pub fn deserialize_datetime_flexible<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    if let Ok(dt) = DateTime::parse_from_rfc3339(&s) {
        return Ok(dt.with_timezone(&Utc));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S%.f") {
        return Ok(DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S") {
        return Ok(DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S%.f") {
        return Ok(DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc));
    }

    Err(serde::de::Error::custom(format!("failed to parse timestamp: {s}")))
}

/// Flat ClickHouse storage model for raw generic events.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventRow {
    /// Unique event identifier.
    pub event_id: String,
    /// Distributed trace identifier.
    pub trace_id: String,
    /// Current execution span identifier.
    pub span_id: String,
    /// Parent span identifier, default empty string if root.
    pub parent_span_id: String,
    /// Originating service name.
    pub service_name: String,
    /// Deployment environment name.
    pub environment: String,
    /// Event category string.
    pub event_type: String,
    /// Raw serialized payload JSON string.
    pub payload_json: String,
    /// Timestamp of event in UTC.
    #[serde(deserialize_with = "deserialize_datetime_flexible")]
    pub timestamp: DateTime<Utc>,
}

/// Flat ClickHouse storage model for function execution records.
/// Matches schema columns in `storage/clickhouse/migrations/001_initial_schema.sql`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecutionRow {
    /// Unique event identifier.
    pub event_id: String,
    /// Distributed trace identifier.
    pub trace_id: String,
    /// Current execution span identifier.
    pub span_id: String,
    /// Parent span identifier, default empty string if root.
    pub parent_span_id: String,
    /// Originating service name.
    pub service_name: String,
    /// Deployment environment.
    pub environment: String,
    /// Module / namespace path of the function.
    pub module_name: String,
    /// Enclosing class or struct name, default empty string if standalone.
    pub class_name: String,
    /// Name of the function / method.
    pub function_name: String,
    /// Source file path where function is located.
    pub file_path: String,
    /// Source line number, 0 if unknown.
    pub line_number: u32,
    /// Serialized JSON string of function input parameters.
    pub input_json: String,
    /// Serialized JSON string of function output / return value.
    pub output_json: String,
    /// Wall-clock execution duration in milliseconds.
    pub duration_ms: f64,
    /// Wall-clock execution duration in nanoseconds.
    pub duration_nanos: u64,
    /// Execution status (`success`, `error`, `timeout`, `dropped`).
    pub status: String,
    /// Error type name, default empty string.
    pub error_type: String,
    /// Error message, default empty string.
    pub error_message: String,
    /// Error stack trace, default empty string.
    pub error_stack: String,
    /// Serialized attributes/tags JSON string.
    pub attributes_json: String,
    /// Timestamp of execution start or completion in UTC.
    #[serde(deserialize_with = "deserialize_datetime_flexible")]
    pub timestamp: DateTime<Utc>,
}
