use globset::{Glob, GlobSet, GlobSetBuilder};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Error building or evaluating pattern matchers.
#[derive(Debug, Error)]
pub enum MatcherError {
    #[error("Failed to compile pattern '{pattern}': {source}")]
    InvalidPattern {
        pattern: String,
        #[source]
        source: globset::Error,
    },
    #[error("Failed to build glob set: {0}")]
    BuildError(#[from] globset::Error),
}

/// Client instrumentation configuration determining which functions are observed,
/// sampling rates, sanitization masks, and payload boundaries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InstrumentationConfig {
    /// Glob patterns for functions/modules to observe (e.g. `OrderService.*`, `services/**`).
    #[serde(default)]
    pub include: Vec<String>,
    /// Glob patterns for functions/methods to exclude from observation (takes precedence).
    #[serde(default)]
    pub exclude: Vec<String>,
    /// Sampling rate between 0.0 and 1.0 (1.0 = 100% of executions observed).
    #[serde(default = "default_sampling_rate")]
    pub sampling_rate: f64,
    /// Case-insensitive field keys to sanitize in input/output payloads.
    #[serde(default = "default_sensitive_keys")]
    pub sensitive_keys: Vec<String>,
    /// Maximum payload size in bytes before truncation (default 64KB).
    #[serde(default = "default_max_payload_bytes")]
    pub max_payload_bytes: usize,
}

fn default_sampling_rate() -> f64 {
    1.0
}

fn default_sensitive_keys() -> Vec<String> {
    vec![
        "password".to_string(),
        "token".to_string(),
        "secret".to_string(),
        "authorization".to_string(),
        "api_key".to_string(),
        "access_token".to_string(),
        "refresh_token".to_string(),
        "private_key".to_string(),
    ]
}

fn default_max_payload_bytes() -> usize {
    65_536
}

impl Default for InstrumentationConfig {
    fn default() -> Self {
        Self {
            include: Vec::new(),
            exclude: Vec::new(),
            sampling_rate: default_sampling_rate(),
            sensitive_keys: default_sensitive_keys(),
            max_payload_bytes: default_max_payload_bytes(),
        }
    }
}

/// Compiled pattern matcher executing fast include/exclude evaluations.
#[derive(Debug, Clone)]
pub struct PatternMatcher {
    include_set: Option<GlobSet>,
    exclude_set: Option<GlobSet>,
}

impl PatternMatcher {
    /// Compiles an `InstrumentationConfig` into a fast `PatternMatcher`.
    pub fn new(config: &InstrumentationConfig) -> Result<Self, MatcherError> {
        let include_set = if config.include.is_empty() {
            None
        } else {
            let mut builder = GlobSetBuilder::new();
            for pattern in &config.include {
                let glob = Glob::new(pattern).map_err(|e| MatcherError::InvalidPattern {
                    pattern: pattern.clone(),
                    source: e,
                })?;
                builder.add(glob);
            }
            Some(builder.build()?)
        };

        let exclude_set = if config.exclude.is_empty() {
            None
        } else {
            let mut builder = GlobSetBuilder::new();
            for pattern in &config.exclude {
                let glob = Glob::new(pattern).map_err(|e| MatcherError::InvalidPattern {
                    pattern: pattern.clone(),
                    source: e,
                })?;
                builder.add(glob);
            }
            Some(builder.build()?)
        };

        Ok(Self {
            include_set,
            exclude_set,
        })
    }

    /// Evaluates whether a function or target matches instrumentation criteria.
    /// Exclude rules strictly take precedence over include rules.
    pub fn matches(&self, target: &str) -> bool {
        // 1. Exclude rules take strict precedence
        if let Some(ref excludes) = self.exclude_set {
            if excludes.is_match(target) {
                return false;
            }
        }

        // 2. Target must match at least one include pattern
        if let Some(ref includes) = self.include_set {
            includes.is_match(target)
        } else {
            false
        }
    }
}

impl InstrumentationConfig {
    /// Builds a compiled `PatternMatcher` for this configuration.
    pub fn build_matcher(&self) -> Result<PatternMatcher, MatcherError> {
        PatternMatcher::new(self)
    }

    /// Evaluates if a given function target string should be instrumented.
    pub fn should_instrument(&self, target: &str) -> bool {
        match self.build_matcher() {
            Ok(matcher) => matcher.matches(target),
            Err(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_yaml_config_parsing() {
        let yaml = r#"
include:
  - "OrderService.*"
  - "PaymentService.create"
  - "src/services/**/*.ts"
exclude:
  - "*.toJSON"
  - "*.serialize"
  - "OrderService.internalDebug"
sampling_rate: 0.5
sensitive_keys:
  - "apiKey"
  - "ssn"
max_payload_bytes: 32768
"#;
        let config: InstrumentationConfig =
            serde_yaml::from_str(yaml).expect("parse instrumentation yaml");

        assert_eq!(config.include.len(), 3);
        assert_eq!(config.exclude.len(), 3);
        assert_eq!(config.sampling_rate, 0.5);
        assert_eq!(config.max_payload_bytes, 32768);
        assert!(config.sensitive_keys.contains(&"ssn".to_string()));

        let matcher = config.build_matcher().expect("compile matcher");

        // Included method
        assert!(matcher.matches("OrderService.checkout"));
        assert!(matcher.matches("PaymentService.create"));

        // Excluded method despite matching include
        assert!(!matcher.matches("OrderService.toJSON"));
        assert!(!matcher.matches("OrderService.internalDebug"));

        // Unincluded method
        assert!(!matcher.matches("UnrelatedService.foo"));
    }

    #[test]
    fn test_empty_include_matches_nothing() {
        let config = InstrumentationConfig::default();
        let matcher = config.build_matcher().expect("compile matcher");
        assert!(!matcher.matches("AnyFunction"));
    }

    #[test]
    fn test_exclude_strict_precedence() {
        let config = InstrumentationConfig {
            include: vec!["*".to_string()],
            exclude: vec!["SecretService.*".to_string()],
            ..Default::default()
        };
        let matcher = config.build_matcher().expect("compile matcher");

        assert!(matcher.matches("NormalService.run"));
        assert!(!matcher.matches("SecretService.run"));
    }
}
