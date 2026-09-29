use axum::extract::{FromRef, FromRequestParts};
use axum::http::request::Parts;
use axum::http::HeaderMap;
use eventslog_common::ApiError;
use eventslog_config::ServerConfig;
use std::sync::Arc;

/// Extracted and verified authentication credentials.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthContext {
    pub client_key: String,
}

impl AuthContext {
    /// Validates request headers against the expected server API key.
    pub fn validate(headers: &HeaderMap, expected_key: Option<&str>) -> Result<Self, ApiError> {
        let key = extract_api_key(headers).ok_or_else(|| {
            ApiError::Unauthorized(
                "Missing API key header (x-api-key or Authorization: Bearer <key>)".to_string(),
            )
        })?;

        if let Some(expected) = expected_key {
            if key != expected {
                return Err(ApiError::Unauthorized("Invalid API key".to_string()));
            }
        } else if key.trim().is_empty() {
            return Err(ApiError::Unauthorized("API key cannot be empty".to_string()));
        }

        Ok(Self { client_key: key })
    }
}

/// Helper to parse api key from `x-api-key` or `Authorization: Bearer <key>`.
pub fn extract_api_key(headers: &HeaderMap) -> Option<String> {
    if let Some(val) = headers.get("x-api-key").and_then(|v| v.to_str().ok()) {
        if !val.trim().is_empty() {
            return Some(val.trim().to_string());
        }
    }

    if let Some(auth_val) = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        if let Some(bearer_token) = auth_val.strip_prefix("Bearer ") {
            if !bearer_token.trim().is_empty() {
                return Some(bearer_token.trim().to_string());
            }
        }
    }

    None
}

/// Axum extractor for authenticated endpoints.
#[axum::async_trait]
impl<S> FromRequestParts<S> for AuthContext
where
    S: Send + Sync,
    Arc<ServerConfig>: axum::extract::FromRef<S>,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let config = Arc::<ServerConfig>::from_ref(state);
        AuthContext::validate(&parts.headers, config.api_key.as_deref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn test_extract_x_api_key() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", HeaderValue::from_static("test-key-123"));

        let key = extract_api_key(&headers);
        assert_eq!(key, Some("test-key-123".to_string()));

        let auth = AuthContext::validate(&headers, Some("test-key-123")).unwrap();
        assert_eq!(auth.client_key, "test-key-123");
    }

    #[test]
    fn test_extract_bearer_token() {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            HeaderValue::from_static("Bearer token-xyz"),
        );

        let key = extract_api_key(&headers);
        assert_eq!(key, Some("token-xyz".to_string()));

        let auth = AuthContext::validate(&headers, Some("token-xyz")).unwrap();
        assert_eq!(auth.client_key, "token-xyz");
    }

    #[test]
    fn test_reject_missing_key() {
        let headers = HeaderMap::new();
        let res = AuthContext::validate(&headers, Some("expected"));
        assert!(res.is_err());
    }

    #[test]
    fn test_reject_mismatched_key() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", HeaderValue::from_static("wrong-key"));
        let res = AuthContext::validate(&headers, Some("expected"));
        assert!(res.is_err());
    }
}
