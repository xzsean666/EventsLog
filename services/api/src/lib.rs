//! EventsLog Platform API Service Library.
//!
//! Control plane service managing projects, environments, and API authentication keys.

pub mod models;
pub mod router;
pub mod state;

pub use models::{ApiKey, CreateApiKeyRequest, CreateProjectRequest, Project};
pub use router::create_router;
pub use state::AppState;
