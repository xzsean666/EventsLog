use serde::{Deserialize, Serialize};

use crate::attributes::Attributes;
use crate::error::ExecutionError;

/// Uniquely identifies an observed function or callable within an application codebase.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FunctionIdentity {
    /// Module, package, or namespace identifier (e.g. `services.order` or `src/services/order.ts`).
    pub module: String,
    /// Optional enclosing class, struct, or object name (e.g. `OrderService`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub class_name: Option<String>,
    /// Name of the function, method, or callable (e.g. `createOrder`).
    pub function_name: String,
    /// Optional source file path where the function is declared.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    /// Optional source file line number.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_number: Option<u32>,
}

impl FunctionIdentity {
    /// Creates a new `FunctionIdentity`.
    pub fn new(module: impl Into<String>, function_name: impl Into<String>) -> Self {
        Self {
            module: module.into(),
            class_name: None,
            function_name: function_name.into(),
            file_path: None,
            line_number: None,
        }
    }

    /// Sets the enclosing class name.
    pub fn with_class(mut self, class_name: impl Into<String>) -> Self {
        self.class_name = Some(class_name.into());
        self
    }

    /// Sets the source location.
    pub fn with_location(mut self, file_path: impl Into<String>, line_number: u32) -> Self {
        self.file_path = Some(file_path.into());
        self.line_number = Some(line_number);
        self
    }

    /// Returns a human-readable canonical display string for the function.
    pub fn canonical_name(&self) -> String {
        if let Some(ref class_name) = self.class_name {
            format!("{}.{}", class_name, self.function_name)
        } else if !self.module.is_empty() {
            format!("{}:{}", self.module, self.function_name)
        } else {
            self.function_name.clone()
        }
    }
}

/// Execution status outcome for a function call.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    /// Function executed and returned successfully.
    Success,
    /// Function threw or returned an unhandled error/exception.
    Error,
    /// Function execution exceeded configured timeout.
    Timeout,
    /// Function execution was intentionally dropped or short-circuited.
    Dropped,
}

impl ExecutionStatus {
    /// Returns the string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Error => "error",
            Self::Timeout => "timeout",
            Self::Dropped => "dropped",
        }
    }
}

/// Full execution payload of an observed function call.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FunctionExecution {
    /// Identity and location of the observed function.
    pub function: FunctionIdentity,
    /// Captured function input arguments (sanitized JSON).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_payload: Option<serde_json::Value>,
    /// Captured function return value (sanitized JSON).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_payload: Option<serde_json::Value>,
    /// Wall-clock execution duration in nanoseconds.
    pub duration_nanos: u64,
    /// Final execution status.
    pub status: ExecutionStatus,
    /// Error details if the execution failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ExecutionError>,
    /// Optional metadata or execution tags.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attributes: Option<Attributes>,
}

impl FunctionExecution {
    /// Returns duration converted to floating-point milliseconds.
    pub fn duration_ms(&self) -> f64 {
        self.duration_nanos as f64 / 1_000_000.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_function_identity_canonical_name() {
        let f1 = FunctionIdentity::new("order", "calculate_total").with_class("OrderCalculator");
        assert_eq!(f1.canonical_name(), "OrderCalculator.calculate_total");

        let f2 = FunctionIdentity::new("utils", "hash_key");
        assert_eq!(f2.canonical_name(), "utils:hash_key");
    }

    #[test]
    fn test_function_execution_serialization() {
        let identity = FunctionIdentity::new("services.auth", "verify_token")
            .with_class("AuthService")
            .with_location("src/services/auth.ts", 42);

        let execution = FunctionExecution {
            function: identity,
            input_payload: Some(json!({"token": "***"})),
            output_payload: Some(json!({"user_id": 123})),
            duration_nanos: 15_500_000,
            status: ExecutionStatus::Success,
            error: None,
            attributes: None,
        };

        assert!((execution.duration_ms() - 15.5).abs() < f64::EPSILON);

        let serialized = serde_json::to_string(&execution).expect("serialize execution");
        let deserialized: FunctionExecution =
            serde_json::from_str(&serialized).expect("deserialize execution");

        assert_eq!(deserialized.status, ExecutionStatus::Success);
        assert_eq!(deserialized.function.function_name, "verify_token");
        assert_eq!(deserialized.input_payload, Some(json!({"token": "***"})));
        assert_eq!(deserialized.error, None);
    }
}
