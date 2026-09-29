use eventslog_common::{init_tracing, LogFormat};
use eventslog_config::ServerConfig;
use eventslog_query::create_router;
use tokio::signal;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    init_tracing(LogFormat::Compact);

    let mut config = ServerConfig::default();
    config.port = 8081; // Query service runs on port 8081
    config.service_name = "eventslog-query".to_string();

    let addr = config.socket_addr_str();

    info!(
        service = %config.service_name,
        env = %config.environment,
        addr = %addr,
        clickhouse_url = %config.clickhouse_url,
        "Starting EventsLog Query Service"
    );

    let app = create_router(config);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Query service listening on http://{}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Query service shut down gracefully.");
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
