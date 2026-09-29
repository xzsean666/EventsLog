//! EventsLog Storage Schema definitions.
//!
//! Provides ClickHouse row representations and bi-directional conversions
//! between wire protocol events and columnar storage rows.

pub mod convert;
pub mod models;

pub use convert::SchemaError;
pub use models::{deserialize_datetime_flexible, EventRow, ExecutionRow};
