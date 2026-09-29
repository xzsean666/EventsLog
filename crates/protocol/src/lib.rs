//! EventsLog Protocol definitions.
//!
//! This crate contains canonical protocol models, types, and event definitions
//! shared across the EventsLog platform.

pub mod attributes;
pub mod error;
pub mod event;
pub mod function;

pub use attributes::Attributes;
pub use error::ExecutionError;
pub use event::{BatchEventPayload, Event, EventPayload, EventType};
pub use function::{ExecutionStatus, FunctionExecution, FunctionIdentity};

pub const PROTOCOL_VERSION: &str = "1.0.0";

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn test_protocol_version() {
        assert_eq!(PROTOCOL_VERSION, "1.0.0");
    }

    #[test]
    fn test_end_to_end_protocol_envelope() {
        let err = ExecutionError::new("DatabaseTimeout", "Query timed out after 5000ms")
            .with_stack_trace("at Connection.query (/app/db.js:88:12)");

        let mut attrs = Attributes::new();
        attrs.insert_val("db.table", json!("users"));
        attrs.insert_val("db.statement", json!("SELECT * FROM users WHERE id = ?"));

        let execution = FunctionExecution {
            function: FunctionIdentity::new("database", "find_user")
                .with_class("UserRepository")
                .with_location("src/db/users.ts", 42),
            input_payload: Some(json!({"user_id": 999})),
            output_payload: None,
            duration_nanos: 5_001_200_000,
            status: ExecutionStatus::Timeout,
            error: Some(err),
            attributes: Some(attrs),
        };

        let event = Event {
            event_id: Uuid::new_v4(),
            trace_id: "0af7651916cd43dd8448eb211c80319c".to_string(),
            span_id: "b7ad6b7169203331".to_string(),
            parent_span_id: Some("00f067aa0ba902b7".to_string()),
            timestamp: Utc::now(),
            service_name: "user-service".to_string(),
            environment: "staging".to_string(),
            event_type: EventType::FunctionExecution,
            payload: EventPayload::FunctionExecution(execution),
        };

        let json_str = serde_json::to_string(&event).expect("serialize event");
        let decoded: Event = serde_json::from_str(&json_str).expect("deserialize event");

        assert_eq!(decoded.trace_id, "0af7651916cd43dd8448eb211c80319c");
        assert_eq!(decoded.span_id, "b7ad6b7169203331");
        assert_eq!(
            decoded.parent_span_id.as_deref(),
            Some("00f067aa0ba902b7")
        );
        assert_eq!(decoded.service_name, "user-service");
        assert_eq!(decoded.environment, "staging");

        let exec = decoded.as_function_execution().expect("execution payload");
        assert_eq!(exec.function.canonical_name(), "UserRepository.find_user");
        assert_eq!(exec.status, ExecutionStatus::Timeout);
        assert!(exec.duration_ms() > 5000.0);

        let err_unwrapped = exec.error.as_ref().expect("error present");
        assert_eq!(err_unwrapped.type_name, "DatabaseTimeout");
        assert_eq!(
            err_unwrapped.message,
            "Query timed out after 5000ms"
        );
    }
}
