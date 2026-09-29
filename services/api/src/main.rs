use eventslog_api::create_router;
use eventslog_common::{init_tracing, LogFormat};
use eventslog_config::ServerConfig;
use tokio::signal;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    init_tracing(LogFormat::Compact);

    let mut config = ServerConfig::from_env();
    if std::env::var("PORT").is_err() && std::env::var("EVENTSLOG_PORT").is_err() {
        config.port = 8082; // Default Platform API service port
    }
    if config.service_name == "eventslog-service" {
        config.service_name = "eventslog-api".to_string();
    }

    let addr = config.socket_addr_str();

    info!(
        service = %config.service_name,
        env = %config.environment,
        addr = %addr,
        "Starting EventsLog Platform API Service"
    );

    let app = create_router(config);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Platform API service listening on http://{}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Platform API service shut down gracefully.");
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
