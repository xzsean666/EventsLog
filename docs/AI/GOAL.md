# EventsLog — Project Goal

## Product Vision
EventsLog is a **Zero-Code Function Observability Platform**.
It enables developers to observe application functions, execution trees, inputs, outputs, errors, and performance without modifying a single line of business code.

> **"Configure the Functions you care about, and EventsLog automatically makes their executions observable."**

## Core Objectives
1. **Zero Business-Code Changes**:
   Observability must be configured via configuration (declarative include/exclude patterns) and attached via runtime instrumentation/hooks.
2. **Function-First Observability**:
   Function / Callable is the primary observability unit. Every execution records input, output, duration, status, error, and trace linkage.
3. **Trace Tree Reconstruction**:
   Execution hierarchy (parent / child function calls) across asynchronous contexts is preserved and visualized as an execution tree.
4. **Resilience & Non-Intrusiveness**:
   Observability failure must NEVER crash or block the host business application. If ingestion or ClickHouse fails, events are safely dropped.
5. **Privacy & Security by Default**:
   Sensitive fields (passwords, tokens, keys) are sanitized before transmission; payloads and memory usage are strictly bounded.
6. **High Performance Monorepo Architecture**:
   - Multi-SDK architecture with **Node.js** as the first implementation target.
   - High-throughput **Rust backend services** (`ingestion`, `query`, `api`) backed by shared crates (`protocol`, `schema`, `config`, `common`).
   - High-performance column-oriented **ClickHouse** storage.
   - Clean, modern **Web Dashboard** for function and trace investigation.

## Initial Implementation Scope & Milestones
- **Milestone 1**: Monorepo skeleton, root tooling, Rust shared crates (`protocol`, `schema`, `config`).
- **Milestone 2**: ClickHouse storage schema and migrations.
- **Milestone 3**: Rust Ingestion Service (HTTP API, event validation, batch buffering, ClickHouse writer).
- **Milestone 4**: Node.js SDK (zero-code instrumentation, trace context propagation, input/output capture, sanitization, batching, transport).
- **Milestone 5**: Rust Query & API Service (function queries, execution queries, trace reconstruction).
- **Milestone 6**: Web Dashboard (Function list, execution drill-down, trace graph, error analysis).
- **Milestone 7**: End-to-end example and integration tests.
