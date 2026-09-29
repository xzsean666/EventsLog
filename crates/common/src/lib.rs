//! EventsLog Common Utilities.
//!
//! Reusable backend utilities including structured logging initialization,
//! standard API error responses, and HTTP response adapters.

pub mod error;
pub mod logging;

pub use error::{ApiError, ApiErrorDetail, ApiErrorResponse};
pub use logging::{init_tracing, LogFormat};
