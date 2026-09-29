use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Structured error payload embedded inside `ApiErrorResponse`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiErrorDetail {
    /// Machine-readable error code (e.g. `UNAUTHORIZED`, `BAD_REQUEST`).
    pub code: String,
    /// Human-readable explanation.
    pub message: String,
}

/// Standard top-level API error envelope matching `{ "error": { "code": "...", "message": "..." } }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiErrorResponse {
    pub error: ApiErrorDetail,
}

impl ApiErrorResponse {
    /// Constructs a new error response envelope.
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error: ApiErrorDetail {
                code: code.into(),
                message: message.into(),
            },
        }
    }
}

/// Standard API error variants across EventsLog HTTP services.
#[derive(Debug, Error)]
pub enum ApiError {
    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Bad Request: {0}")]
    BadRequest(String),

    #[error("Not Found: {0}")]
    NotFound(String),

    #[error("Payload Too Large: {0}")]
    PayloadTooLarge(String),

    #[error("Internal Server Error: {0}")]
    Internal(String),

    #[error("Database Error: {0}")]
    Database(String),
}

impl ApiError {
    /// Returns the corresponding HTTP status code.
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::PayloadTooLarge(_) => StatusCode::PAYLOAD_TOO_LARGE,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// Returns the machine-readable error code string.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unauthorized(_) => "UNAUTHORIZED",
            Self::BadRequest(_) => "BAD_REQUEST",
            Self::NotFound(_) => "NOT_FOUND",
            Self::PayloadTooLarge(_) => "PAYLOAD_TOO_LARGE",
            Self::Internal(_) => "INTERNAL_SERVER_ERROR",
            Self::Database(_) => "DATABASE_ERROR",
        }
    }

    /// Converts this error into an `ApiErrorResponse`.
    pub fn to_response_body(&self) -> ApiErrorResponse {
        ApiErrorResponse::new(self.code(), self.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let body = self.to_response_body();
        (status, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_response_format() {
        let err = ApiError::Unauthorized("Invalid API key provided".to_string());
        assert_eq!(err.status_code(), StatusCode::UNAUTHORIZED);
        assert_eq!(err.code(), "UNAUTHORIZED");

        let response_body = err.to_response_body();
        let json = serde_json::to_string(&response_body).expect("serialize error response");

        assert_eq!(
            json,
            r#"{"error":{"code":"UNAUTHORIZED","message":"Unauthorized: Invalid API key provided"}}"#
        );
    }

    #[test]
    fn test_bad_request_error() {
        let err = ApiError::BadRequest("Missing trace_id field".to_string());
        assert_eq!(err.status_code(), StatusCode::BAD_REQUEST);
        assert_eq!(err.code(), "BAD_REQUEST");
    }
}
