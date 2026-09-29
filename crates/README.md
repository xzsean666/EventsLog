# EventsLog Shared Rust Crates

This directory contains shared Rust libraries used across EventsLog backend services:

- [`protocol/`](protocol/): The canonical event model and serialization protocol (used by all services and mirrored by SDKs).
- [`schema/`](schema/): Storage data models, database records, and schema definitions for ClickHouse.
- [`config/`](config/): Configuration parser and validation for backend components.
- [`common/`](common/): Genuine backend utilities (logging, metrics, error types).
