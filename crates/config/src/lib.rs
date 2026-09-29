//! EventsLog Configuration crate.
//!
//! Provides configuration structures and validation logic for backend services
//! and client instrumentation.

pub mod instrumentation;
pub mod server;

pub use instrumentation::{InstrumentationConfig, MatcherError, PatternMatcher};
pub use server::ServerConfig;
