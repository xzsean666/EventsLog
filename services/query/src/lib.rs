//! EventsLog Query Service Library.
//!
//! Provides query endpoints for functions, executions, and trace reconstruction
//! backing the Web Dashboard.

pub mod auth;
pub mod handlers;
pub mod router;
pub mod storage;

pub use auth::AuthContext;
pub use handlers::{
    build_trace_tree, get_execution, get_stats, get_trace, list_function_executions,
    list_functions, ExecutionEnvelope, FunctionExecutionsResponse, FunctionsResponse,
    StatsEnvelope, StatsResponse, TraceEnvelope, TraceNode, TraceResponse,
};
pub use router::{create_router, create_router_with_storage, AppState};
pub use storage::{
    ClickHouseStorageClient, ExecutionFilter, FunctionFilter, FunctionSummary, QueryStorageError,
};
