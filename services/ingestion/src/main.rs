use eventslog_common::{init_tracing, LogFormat};
use eventslog_config::ServerConfig;
use eventslog_ingestion::{
    create_router_with_buffer, BatchBuffer, BatchBufferConfig, ClickHouseWriter, DropPolicy,
};
use std::sync::Arc;
use std::time::Duration;
use tokio::signal;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    init_tracing(LogFormat::Compact);

    let config = ServerConfig::default();
    let addr = config.socket_addr_str();

    info!(
        service = %config.service_name,
        env = %config.environment,
        addr = %addr,
        clickhouse_url = %config.clickhouse_url,
        "Starting EventsLog Ingestion Service"
    );

    // ClickHouse batched consumer
    let (sink_tx, sink_rx) = tokio::sync::mpsc::channel(100);
    let writer = ClickHouseWriter::new(&config.clickhouse_url);
    let _writer_handle = writer.spawn_consumer(sink_rx);

    // Memory ring buffer
    let buffer_config = BatchBufferConfig {
        max_capacity: config.buffer_size,
        batch_size: 1_000,
        flush_interval: Duration::from_millis(config.flush_interval_ms),
        drop_policy: DropPolicy::DropNewest,
    };
    let buffer = Arc::new(BatchBuffer::new(buffer_config, sink_tx));

    let app = create_router_with_buffer(config, buffer);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Ingestion service listening on http://{}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Ingestion service shut down gracefully.");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("Received Ctrl+C, initiating graceful shutdown");
        },
        _ = terminate => {
            info!("Received SIGTERM, initiating graceful shutdown");
        },
    }
}
