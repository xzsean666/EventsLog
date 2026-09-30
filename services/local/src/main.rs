use eventslog_common::{init_tracing, LogFormat};
use eventslog_local::{create_router, SqliteStorage};
use std::env;
use std::net::SocketAddr;
use tokio::signal;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    init_tracing(LogFormat::Compact);

    let args: Vec<String> = env::args().collect();
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!("EventsLog Local Service (SQLite Backend)");
        println!();
        println!("Usage: eventslog-local [OPTIONS]");
        println!();
        println!("Options:");
        println!("  --port <PORT>      HTTP port to listen on (default: 8080, env: PORT or EVENTSLOG_PORT)");
        println!("  --db <PATH>        SQLite database file path (default: ./eventslog.db, env: EVENTSLOG_DB_PATH)");
        println!("  -h, --help         Print help message");
        println!();
        return Ok(());
    }

    let mut port: u16 = 8080;
    let mut db_path = "./eventslog.db".to_string();

    if let Ok(env_port) = env::var("PORT").or_else(|_| env::var("EVENTSLOG_PORT")) {
        if let Ok(p) = env_port.parse::<u16>() {
            port = p;
        }
    }

    if let Ok(env_db) = env::var("EVENTSLOG_DB_PATH") {
        db_path = env_db;
    }

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" => {
                if i + 1 < args.len() {
                    if let Ok(p) = args[i + 1].parse::<u16>() {
                        port = p;
                    }
                    i += 1;
                }
            }
            "--db" => {
                if i + 1 < args.len() {
                    db_path = args[i + 1].clone();
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    info!(
        db_path = %db_path,
        port = %port,
        "Initializing EventsLog Local Service (SQLite storage engine)"
    );

    let storage = SqliteStorage::open(&db_path)?;
    let app = create_router(storage);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    info!("EventsLog Local Service running on http://127.0.0.1:{}", port);
    info!("Ingestion API: POST http://127.0.0.1:{}/v1/events", port);
    info!("Query APIs:    GET  http://127.0.0.1:{}/v1/functions", port);
    info!("Health check:  GET  http://127.0.0.1:{}/health", port);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("EventsLog Local Service stopped gracefully.");
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
            info!("Received Ctrl+C, shutting down local service");
        },
        _ = terminate => {
            info!("Received SIGTERM, shutting down local service");
        },
    }
}
