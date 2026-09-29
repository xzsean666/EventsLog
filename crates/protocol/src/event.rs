use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::ExecutionError;
use crate::function::FunctionExecution;

/// Category of an observed event in the platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    /// Function execution observation.
    FunctionExecution,
    /// System-level event (e.g. startup, shutdown, resource alert).
    System,
    /// Performance or custom metric point.
    Metric,
    /// System or unhandled runtime error.
    Error,
}

/// Payload variants supported in standard EventsLog events.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum EventPayload {
    /// Function execution payload.
    FunctionExecution(FunctionExecution),
    /// System event payload.
    System(serde_json::Value),
    /// Metric event payload.
    Metric(serde_json::Value),
    /// Error event payload.
    Error(ExecutionError),
    /// Custom event payload.
    Custom(serde_json::Value),
}

/// Top-level envelope for all EventsLog telemetry data.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    /// Unique event identifier.
    pub event_id: Uuid,
    /// Distributed trace identifier.
    pub trace_id: String,
    /// Current execution span identifier.
    pub span_id: String,
    /// Enclosing/parent execution span identifier, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_span_id: Option<String>,
    /// UTC timestamp of event creation or occurrence.
    pub timestamp: DateTime<Utc>,
    /// Originating service or application name.
    pub service_name: String,
    /// Deployment environment (e.g. `production`, `staging`, `local`).
    pub environment: String,
    /// Event category.
    pub event_type: EventType,
    /// Embedded typed payload.
    pub payload: EventPayload,
}

impl Event {
    /// Creates a new function execution event envelope.
    pub fn new_function_execution(
        trace_id: impl Into<String>,
        span_id: impl Into<String>,
        service_name: impl Into<String>,
        environment: impl Into<String>,
        execution: FunctionExecution,
    ) -> Self {
        Self {
            event_id: Uuid::new_v4(),
            trace_id: trace_id.into(),
            span_id: span_id.into(),
            parent_span_id: None,
            timestamp: Utc::now(),
            service_name: service_name.into(),
            environment: environment.into(),
            event_type: EventType::FunctionExecution,
            payload: EventPayload::FunctionExecution(execution),
        }
    }

    /// Sets the parent span identifier for trace hierarchy reconstruction.
    pub fn with_parent_span_id(mut self, parent_span_id: impl Into<String>) -> Self {
        self.parent_span_id = Some(parent_span_id.into());
        self
    }

    /// Convenience accessor to extract reference to `FunctionExecution` if payload is of that variant.
    pub fn as_function_execution(&self) -> Option<&FunctionExecution> {
        match &self.payload {
            EventPayload::FunctionExecution(exec) => Some(exec),
            _ => None,
        }
    }
}

/// Request/transfer wrapper containing a batch of events sent by client SDKs.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct BatchEventPayload {
    /// Ordered list of events included in this batch.
    pub events: Vec<Event>,
}

impl BatchEventPayload {
    /// Creates a new empty `BatchEventPayload`.
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }

    /// Creates a `BatchEventPayload` with pre-allocated event vector.
    pub fn with_events(events: Vec<Event>) -> Self {
        Self { events }
    }

    /// Appends an event to the batch.
    pub fn push(&mut self, event: Event) {
        self.events.push(event);
    }

    /// Returns the number of events in the batch.
    pub fn len(&self) -> usize {
        self.events.len()
    }

    /// Returns true if the batch contains no events.
    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::function::{ExecutionStatus, FunctionIdentity};
    use serde_json::json;

    #[test]
    fn test_event_envelope_serialization() {
        let execution = FunctionExecution {
            function: FunctionIdentity::new("orders", "place_order").with_class("OrderController"),
            input_payload: Some(json!({"item_id": 101, "quantity": 2})),
            output_payload: Some(json!({"order_id": "ord_999"})),
            duration_nanos: 4_200_000,
            status: ExecutionStatus::Success,
            error: None,
            attributes: None,
        };

        let event = Event::new_function_execution(
            "trace-12345",
            "span-001",
            "order-service",
            "production",
            execution,
        )
        .with_parent_span_id("span-parent");

        let serialized = serde_json::to_string_pretty(&event).expect("serialize event");
        let deserialized: Event = serde_json::from_str(&serialized).expect("deserialize event");

        assert_eq!(deserialized.trace_id, "trace-12345");
        assert_eq!(deserialized.span_id, "span-001");
        assert_eq!(deserialized.parent_span_id, Some("span-parent".to_string()));
        assert_eq!(deserialized.service_name, "order-service");
        assert_eq!(deserialized.event_type, EventType::FunctionExecution);

        let exec = deserialized.as_function_execution().expect("execution payload");
        assert_eq!(exec.function.function_name, "place_order");
        assert_eq!(exec.status, ExecutionStatus::Success);
    }

    #[test]
    fn test_batch_payload_roundtrip() {
        let mut batch = BatchEventPayload::new();
        let execution = FunctionExecution {
            function: FunctionIdentity::new("health", "ping"),
            input_payload: None,
            output_payload: Some(json!("pong")),
            duration_nanos: 120_000,
            status: ExecutionStatus::Success,
            error: None,
            attributes: None,
        };
        batch.push(Event::new_function_execution(
            "trace-001",
            "span-100",
            "gateway",
            "test",
            execution,
        ));

        assert_eq!(batch.len(), 1);
        let serialized = serde_json::to_string(&batch).expect("serialize batch");
        let deserialized: BatchEventPayload =
            serde_json::from_str(&serialized).expect("deserialize batch");
        assert_eq!(deserialized.events.len(), 1);
        assert_eq!(deserialized.events[0].trace_id, "trace-001");
    }
}
