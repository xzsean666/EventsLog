//! EventsLog Local Service Library.
//!
//! Provides a unified, single-binary local observability backend powered by SQLite,
//! enabling zero-dependency development, testing, and debugging.

pub mod handlers;
pub mod router;
pub mod storage;

pub use handlers::{
    get_execution, get_stats, get_trace, health_check, ingest_events, list_function_executions,
    list_functions, IngestPayload,
};
pub use router::{create_router, AppState};
pub use storage::{SqliteStorage, StorageError};
