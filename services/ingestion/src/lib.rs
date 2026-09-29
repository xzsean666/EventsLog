//! EventsLog Ingestion Service Library.
//!
//! Exposes router and service handlers for ingestion, validation, batching,
//! and ClickHouse persistence.

pub mod auth;
pub mod buffer;
pub mod handlers;
pub mod router;
pub mod storage;

pub use auth::AuthContext;
pub use buffer::{BatchBuffer, BatchBufferConfig, BufferStats, DropPolicy};
pub use router::{create_router, create_router_with_buffer, AppState};
pub use storage::{ClickHouseWriter, OPTIMIZED_QUERY_PARAMS};
