# EventsLog Client SDKs

This directory contains client-side SDKs for application runtimes.
Each SDK is isolated to its target programming language ecosystem and must NOT mix runtime dependencies with backend services or other language tooling.

## Language SDK Matrix

| Directory | Language / Ecosystem | Status | Description |
| :--- | :--- | :--- | :--- |
| [`node/`](node/) | Node.js (TypeScript / JavaScript) | **Active (Primary Target)** | Automatic zero-code instrumentation, async tracing, transport |
| [`browser/`](browser/) | Browser (TypeScript / JavaScript) | Planned | Client-side web tracing & session observability |
| [`python/`](python/) | Python (Python 3.9+) | Planned | Python function hooks, decorators, and WSGI/ASGI instrumentation |
| [`go/`](go/) | Go (Go 1.22+) | Planned | Go runtime instrumentation & HTTP middleware |
| [`java/`](java/) | Java (JVM / Java 17+) | Planned | Java agent byte-code manipulation |
| [`rust/`](rust/) | Rust (Cargo) | Planned | Rust tracing subscriber & macro integration |

## Architectural Boundary & Functional Rules
- **Universal Auto-Batching Engine**: All client SDKs must implement dual-trigger auto-batching:
  1. **Count-Triggered Flush**: Automatically flush and send logs when the number of buffered events reaches `max_batch_size` (e.g. 100 records).
  2. **Time-Triggered Flush**: Automatically flush and send logs when `flush_interval_ms` (e.g. 500ms) expires, even if the count threshold is not reached.
  3. **Process Termination Flush**: Automatically flush remaining buffered events on process exit/termination.
  4. **Drop on Overflow**: Bounded memory queue (`max_queue_size`) with safe drop policy when downstream is slow.
- **No Backend Leakage**: SDKs must only depend on the EventsLog HTTP/JSON protocol. They must NEVER link to ClickHouse, backend database drivers, or backend service crates.
- **Fail-Safe Observability**: Observability failures inside an SDK must NEVER crash or block the host business application.
