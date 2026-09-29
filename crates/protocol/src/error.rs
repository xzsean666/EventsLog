use serde::{Deserialize, Serialize};

/// Represents an execution error captured from an observed function or system runtime.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionError {
    /// The class or type name of the error (e.g. `TypeError`, `CustomException`).
    pub type_name: String,
    /// The human-readable error message.
    pub message: String,
    /// Optional stack trace or call frames string.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack_trace: Option<String>,
}

impl ExecutionError {
    /// Creates a new `ExecutionError` with type name and message.
    pub fn new(type_name: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            type_name: type_name.into(),
            message: message.into(),
            stack_trace: None,
        }
    }

    /// Appends a stack trace to the error.
    pub fn with_stack_trace(mut self, stack_trace: impl Into<String>) -> Self {
        self.stack_trace = Some(stack_trace.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_serialization() {
        let err = ExecutionError::new("SyntaxError", "Unexpected token")
            .with_stack_trace("at eval (file.js:1:1)");

        let json = serde_json::to_string(&err).expect("serialize error");
        let deserialized: ExecutionError =
            serde_json::from_str(&json).expect("deserialize error");

        assert_eq!(deserialized.type_name, "SyntaxError");
        assert_eq!(deserialized.message, "Unexpected token");
        assert_eq!(
            deserialized.stack_trace.as_deref(),
            Some("at eval (file.js:1:1)")
        );
    }

    #[test]
    fn test_error_without_stack_trace() {
        let err = ExecutionError::new("NetworkError", "Connection refused");
        let json = serde_json::to_string(&err).expect("serialize error");
        assert!(!json.contains("stack_trace"));

        let deserialized: ExecutionError =
            serde_json::from_str(&json).expect("deserialize error");
        assert_eq!(deserialized.stack_trace, None);
    }
}
