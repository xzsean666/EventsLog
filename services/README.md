# EventsLog Backend Services

High-throughput, stateless Rust services powering the EventsLog platform:

- [`ingestion/`](ingestion/): Event ingestion HTTP receiver, buffering, and ClickHouse writer.
- [`query/`](query/): Query API providing functions, executions, and trace reconstruction for the dashboard.
- [`api/`](api/): Platform management API (projects, environments, API keys).
