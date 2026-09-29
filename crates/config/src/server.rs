use serde::{Deserialize, Serialize};

/// Backend server configuration for ingestion and query services.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServerConfig {
    /// Host interface address to bind (e.g. "0.0.0.0" or "127.0.0.1").
    #[serde(default = "default_host")]
    pub host: String,
    /// TCP port to listen on.
    #[serde(default = "default_port")]
    pub port: u16,
    /// ClickHouse HTTP endpoint URL.
    #[serde(default = "default_clickhouse_url")]
    pub clickhouse_url: String,
    /// Maximum number of events to buffer in memory before force-flushing or dropping.
    #[serde(default = "default_buffer_size")]
    pub buffer_size: usize,
    /// Batch flush interval in milliseconds.
    #[serde(default = "default_flush_interval_ms")]
    pub flush_interval_ms: u64,
    /// Optional authentication API key required for client requests.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Deployment environment name.
    #[serde(default = "default_environment")]
    pub environment: String,
    /// Name of this service instance.
    #[serde(default = "default_service_name")]
    pub service_name: String,
}

fn default_host() -> String {
    "0.0.0.0".to_string()
}

fn default_port() -> u16 {
    8080
}

fn default_clickhouse_url() -> String {
    "http://127.0.0.1:8123".to_string()
}

fn default_buffer_size() -> usize {
    10_000
}

fn default_flush_interval_ms() -> u64 {
    200
}

fn default_environment() -> String {
    "development".to_string()
}

fn default_service_name() -> String {
    "eventslog-service".to_string()
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: default_host(),
            port: default_port(),
            clickhouse_url: default_clickhouse_url(),
            buffer_size: default_buffer_size(),
            flush_interval_ms: default_flush_interval_ms(),
            api_key: None,
            environment: default_environment(),
            service_name: default_service_name(),
        }
    }
}

impl ServerConfig {
    /// Returns the socket bind address formatted as `host:port`.
    pub fn socket_addr_str(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_config_defaults() {
        let cfg = ServerConfig::default();
        assert_eq!(cfg.host, "0.0.0.0");
        assert_eq!(cfg.port, 8080);
        assert_eq!(cfg.clickhouse_url, "http://127.0.0.1:8123");
        assert_eq!(cfg.buffer_size, 10_000);
        assert_eq!(cfg.flush_interval_ms, 200);
        assert_eq!(cfg.socket_addr_str(), "0.0.0.0:8080");
    }

    #[test]
    fn test_server_config_yaml_parsing() {
        let yaml = r#"
host: "127.0.0.1"
port: 9000
clickhouse_url: "http://clickhouse.internal:8123"
buffer_size: 50000
flush_interval_ms: 100
api_key: "secret-key-123"
environment: "production"
service_name: "eventslog-ingestion"
"#;
        let cfg: ServerConfig = serde_yaml::from_str(yaml).expect("parse server config yaml");
        assert_eq!(cfg.host, "127.0.0.1");
        assert_eq!(cfg.port, 9000);
        assert_eq!(cfg.api_key.as_deref(), Some("secret-key-123"));
        assert_eq!(cfg.environment, "production");
        assert_eq!(cfg.buffer_size, 50_000);
    }
}
