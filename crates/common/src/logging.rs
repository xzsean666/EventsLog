use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Format option for application logs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    /// JSON formatted logs suitable for container collectors and log aggregators.
    Json,
    /// Compact human-readable console output for local development.
    Compact,
}

impl Default for LogFormat {
    fn default() -> Self {
        Self::Compact
    }
}

/// Initializes global tracing subscriber with the specified log format.
/// Reads filtering rules from `RUST_LOG` environment variable, falling back to `info`.
pub fn init_tracing(format: LogFormat) {
    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,eventslog=debug"));

    match format {
        LogFormat::Json => {
            let json_layer = tracing_subscriber::fmt::layer()
                .json()
                .flatten_event(true);
            let _ = tracing_subscriber::registry()
                .with(env_filter)
                .with(json_layer)
                .try_init();
        }
        LogFormat::Compact => {
            let fmt_layer = tracing_subscriber::fmt::layer().compact();
            let _ = tracing_subscriber::registry()
                .with(env_filter)
                .with(fmt_layer)
                .try_init();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_format_default() {
        assert_eq!(LogFormat::default(), LogFormat::Compact);
    }
}
