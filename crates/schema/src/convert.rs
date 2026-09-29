use eventslog_protocol::{Event, EventPayload, ExecutionStatus};
use thiserror::Error;

use crate::models::{EventRow, ExecutionRow};

/// Conversion errors encountered during event-to-row mapping.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum SchemaError {
    #[error("Event does not contain a function execution payload (found {0})")]
    NotAFunctionExecution(String),
}

impl From<&Event> for EventRow {
    fn from(event: &Event) -> Self {
        let payload_json = serde_json::to_string(&event.payload).unwrap_or_else(|_| "{}".to_string());
        let event_type_str = serde_json::to_string(&event.event_type)
            .unwrap_or_else(|_| "\"unknown\"".to_string())
            .trim_matches('"')
            .to_string();

        Self {
            event_id: event.event_id.to_string(),
            trace_id: event.trace_id.clone(),
            span_id: event.span_id.clone(),
            parent_span_id: event.parent_span_id.clone().unwrap_or_default(),
            service_name: event.service_name.clone(),
            environment: event.environment.clone(),
            event_type: event_type_str,
            payload_json,
            timestamp: event.timestamp,
        }
    }
}

impl From<&Event> for ExecutionRow {
    fn from(event: &Event) -> Self {
        match &event.payload {
            EventPayload::FunctionExecution(exec) => {
                let input_json = exec
                    .input_payload
                    .as_ref()
                    .and_then(|v| serde_json::to_string(v).ok())
                    .unwrap_or_default();

                let output_json = exec
                    .output_payload
                    .as_ref()
                    .and_then(|v| serde_json::to_string(v).ok())
                    .unwrap_or_default();

                let (error_type, error_message, error_stack) = match &exec.error {
                    Some(err) => (
                        err.type_name.clone(),
                        err.message.clone(),
                        err.stack_trace.clone().unwrap_or_default(),
                    ),
                    None => (String::new(), String::new(), String::new()),
                };

                let attributes_json = exec
                    .attributes
                    .as_ref()
                    .and_then(|attrs| serde_json::to_string(attrs).ok())
                    .unwrap_or_default();

                Self {
                    event_id: event.event_id.to_string(),
                    trace_id: event.trace_id.clone(),
                    span_id: event.span_id.clone(),
                    parent_span_id: event.parent_span_id.clone().unwrap_or_default(),
                    service_name: event.service_name.clone(),
                    environment: event.environment.clone(),
                    module_name: exec.function.module.clone(),
                    class_name: exec.function.class_name.clone().unwrap_or_default(),
                    function_name: exec.function.function_name.clone(),
                    file_path: exec.function.file_path.clone().unwrap_or_default(),
                    line_number: exec.function.line_number.unwrap_or(0),
                    input_json,
                    output_json,
                    duration_ms: exec.duration_ms(),
                    duration_nanos: exec.duration_nanos,
                    status: exec.status.as_str().to_string(),
                    error_type,
                    error_message,
                    error_stack,
                    attributes_json,
                    timestamp: event.timestamp,
                }
            }
            EventPayload::Error(err) => Self {
                event_id: event.event_id.to_string(),
                trace_id: event.trace_id.clone(),
                span_id: event.span_id.clone(),
                parent_span_id: event.parent_span_id.clone().unwrap_or_default(),
                service_name: event.service_name.clone(),
                environment: event.environment.clone(),
                module_name: "error".to_string(),
                class_name: String::new(),
                function_name: if !err.type_name.is_empty() {
                    err.type_name.clone()
                } else {
                    "Error".to_string()
                },
                file_path: String::new(),
                line_number: 0,
                input_json: String::new(),
                output_json: String::new(),
                duration_ms: 0.0,
                duration_nanos: 0,
                status: ExecutionStatus::Error.as_str().to_string(),
                error_type: err.type_name.clone(),
                error_message: err.message.clone(),
                error_stack: err.stack_trace.clone().unwrap_or_default(),
                attributes_json: String::new(),
                timestamp: event.timestamp,
            },
            other => Self {
                event_id: event.event_id.to_string(),
                trace_id: event.trace_id.clone(),
                span_id: event.span_id.clone(),
                parent_span_id: event.parent_span_id.clone().unwrap_or_default(),
                service_name: event.service_name.clone(),
                environment: event.environment.clone(),
                module_name: String::new(),
                class_name: String::new(),
                function_name: String::new(),
                file_path: String::new(),
                line_number: 0,
                input_json: String::new(),
                output_json: serde_json::to_string(other).unwrap_or_default(),
                duration_ms: 0.0,
                duration_nanos: 0,
                status: if event.event_type == eventslog_protocol::EventType::Error {
                    ExecutionStatus::Error.as_str().to_string()
                } else {
                    ExecutionStatus::Dropped.as_str().to_string()
                },
                error_type: String::new(),
                error_message: String::new(),
                error_stack: String::new(),
                attributes_json: String::new(),
                timestamp: event.timestamp,
            },
        }
    }
}

impl ExecutionRow {
    /// Attempts to parse an `ExecutionRow` from an `Event`, returning an error if the event
    /// is not a function execution.
    pub fn try_from_event(event: &Event) -> Result<Self, SchemaError> {
        match &event.payload {
            EventPayload::FunctionExecution(_) => Ok(ExecutionRow::from(event)),
            _ => Err(SchemaError::NotAFunctionExecution(format!(
                "{:?}",
                event.event_type
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use eventslog_protocol::{
        Attributes, ExecutionError, FunctionExecution, FunctionIdentity,
    };
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn test_event_to_execution_row_lossless() {
        let mut attrs = Attributes::new();
        attrs.insert_val("region", json!("us-east-1"));

        let err = ExecutionError::new("DatabaseError", "Connection reset")
            .with_stack_trace("traceback line 10");

        let exec = FunctionExecution {
            function: FunctionIdentity::new("billing.charge", "process_charge")
                .with_class("StripeGateway")
                .with_location("src/billing/gateway.ts", 102),
            input_payload: Some(json!({"amount": 5000, "currency": "usd"})),
            output_payload: None,
            duration_nanos: 25_000_000,
            status: ExecutionStatus::Error,
            error: Some(err),
            attributes: Some(attrs),
        };

        let event = Event {
            event_id: Uuid::new_v4(),
            trace_id: "trace_abc".to_string(),
            span_id: "span_xyz".to_string(),
            parent_span_id: Some("span_root".to_string()),
            timestamp: Utc::now(),
            service_name: "billing-service".to_string(),
            environment: "production".to_string(),
            event_type: eventslog_protocol::EventType::FunctionExecution,
            payload: EventPayload::FunctionExecution(exec),
        };

        let row = ExecutionRow::from(&event);

        assert_eq!(row.event_id, event.event_id.to_string());
        assert_eq!(row.trace_id, "trace_abc");
        assert_eq!(row.span_id, "span_xyz");
        assert_eq!(row.parent_span_id, "span_root");
        assert_eq!(row.service_name, "billing-service");
        assert_eq!(row.environment, "production");
        assert_eq!(row.module_name, "billing.charge");
        assert_eq!(row.class_name, "StripeGateway");
        assert_eq!(row.function_name, "process_charge");
        assert_eq!(row.file_path, "src/billing/gateway.ts");
        assert_eq!(row.line_number, 102);
        assert!(row.input_json.contains("\"amount\":5000"));
        assert_eq!(row.output_json, "");
        assert_eq!(row.duration_ms, 25.0);
        assert_eq!(row.duration_nanos, 25_000_000);
        assert_eq!(row.status, "error");
        assert_eq!(row.error_type, "DatabaseError");
        assert_eq!(row.error_message, "Connection reset");
        assert_eq!(row.error_stack, "traceback line 10");
        assert!(row.attributes_json.contains("\"region\":\"us-east-1\""));
    }

    #[test]
    fn test_event_row_conversion() {
        let event = Event {
            event_id: Uuid::new_v4(),
            trace_id: "trace_sys".to_string(),
            span_id: "span_sys".to_string(),
            parent_span_id: None,
            timestamp: Utc::now(),
            service_name: "system-monitor".to_string(),
            environment: "prod".to_string(),
            event_type: eventslog_protocol::EventType::System,
            payload: EventPayload::System(json!({"mem_usage_mb": 128})),
        };

        let row = EventRow::from(&event);
        assert_eq!(row.trace_id, "trace_sys");
        assert_eq!(row.parent_span_id, "");
        assert_eq!(row.event_type, "system");
        assert!(row.payload_json.contains("mem_usage_mb"));
    }

    #[test]
    fn test_try_from_non_execution_event() {
        let event = Event {
            event_id: Uuid::new_v4(),
            trace_id: "trace_met".to_string(),
            span_id: "span_met".to_string(),
            parent_span_id: None,
            timestamp: Utc::now(),
            service_name: "metric-service".to_string(),
            environment: "prod".to_string(),
            event_type: eventslog_protocol::EventType::Metric,
            payload: EventPayload::Metric(json!({"cpu": 12})),
        };

        let result = ExecutionRow::try_from_event(&event);
        assert!(result.is_err());
    }

    #[test]
    fn test_error_event_to_execution_row() {
        let err = ExecutionError::new("TypeError", "Cannot read properties of undefined")
            .with_stack_trace("at eval (index.js:1:1)");

        let event = Event {
            event_id: Uuid::new_v4(),
            trace_id: "trace_err_1".to_string(),
            span_id: "span_err_1".to_string(),
            parent_span_id: None,
            timestamp: Utc::now(),
            service_name: "browser-app".to_string(),
            environment: "prod".to_string(),
            event_type: eventslog_protocol::EventType::Error,
            payload: EventPayload::Error(err),
        };

        let row = ExecutionRow::from(&event);
        assert_eq!(row.status, "error");
        assert_eq!(row.error_type, "TypeError");
        assert_eq!(row.error_message, "Cannot read properties of undefined");
        assert!(row.error_stack.contains("index.js"));
        assert_eq!(row.function_name, "TypeError");
    }
}
