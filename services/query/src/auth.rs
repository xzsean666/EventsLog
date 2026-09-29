use axum::extract::{FromRef, FromRequestParts};
use axum::http::request::Parts;
use axum::http::HeaderMap;
use eventslog_common::ApiError;
use eventslog_config::ServerConfig;
use std::sync::Arc;

/// Extracted and verified authentication credentials for Query API.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthContext {
    pub client_key: String,
}

/// Constant-time byte-level comparison to prevent timing attacks.
#[inline]
pub fn constant_time_eq(a: &str, b: &str) -> bool {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    let max_len = a_bytes.len().max(b_bytes.len());
    let mut diff = (a_bytes.len() ^ b_bytes.len()) as u8;
    for i in 0..max_len {
        let x = a_bytes.get(i).copied().unwrap_or(0);
        let y = b_bytes.get(i).copied().unwrap_or(0);
        diff |= x ^ y;
    }
    diff == 0
}

/// Helper to parse API key from `x-api-key` or `Authorization: Bearer <key>`.
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

impl AuthContext {
    /// Validates request headers against the expected server API key.
    pub fn validate(headers: &HeaderMap, expected_key: Option<&str>) -> Result<Self, ApiError> {
        match expected_key {
            Some(expected) => {
                let key = extract_api_key(headers).ok_or_else(|| {
                    ApiError::Unauthorized(
                        "Missing API key header (x-api-key or Authorization: Bearer <key>)".to_string(),
                    )
                })?;

                if !constant_time_eq(&key, expected) {
                    return Err(ApiError::Unauthorized("Invalid API key".to_string()));
                }

                Ok(Self { client_key: key })
            }
            None => {
                let key = extract_api_key(headers).unwrap_or_default();
                Ok(Self { client_key: key })
            }
        }
    }
}

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
    fn test_auth_validate_with_key() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", HeaderValue::from_static("query-secret-123"));

        let auth = AuthContext::validate(&headers, Some("query-secret-123")).unwrap();
        assert_eq!(auth.client_key, "query-secret-123");
    }

    #[test]
    fn test_auth_reject_mismatched_key() {
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", HeaderValue::from_static("wrong-key"));

        let res = AuthContext::validate(&headers, Some("query-secret-123"));
        assert!(res.is_err());
    }

    #[test]
    fn test_auth_allows_unauthenticated_when_no_server_key() {
        let headers = HeaderMap::new();
        let auth = AuthContext::validate(&headers, None).unwrap();
        assert_eq!(auth.client_key, "");
    }
}
