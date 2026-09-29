# EventsLog

> **Zero-Code Function Observability Platform**
>
> Observe application functions, execution trees, inputs, outputs, errors, and performance metrics without modifying a single line of business code.

---

## 1. Overview

**EventsLog** allows developers to observe application execution directly at the function level. Instead of manually scattering logs, custom spans, or decorators across business codebases, developers declare which functions, classes, or modules to observe via configuration.

EventsLog automatically instruments application runtimes and captures:
- **Function Identity**: Module, class, method name, file location.
- **Inputs & Outputs**: Serialized arguments and return values (with privacy sanitization).
- **Execution Lifecycle**: Execution duration, execution status (success, error), exceptions/stack traces.
- **Trace Trees**: Parent/child execution causality across asynchronous boundaries.
- **System Context**: Service name, environment, host, process metadata.

```text
Business Code (Unchanged)
           │
           ▼
EventsLog Configuration (YAML / JSON)
           │
           ▼
Automatic Instrumentation (Loader Hook / Agent)
           │
           ▼
Function Observability ──► Rust Ingestion ──► ClickHouse ──► Dashboard
```

---

## 2. Repository Architecture

EventsLog is structured as a multi-language monorepo centered around product boundaries:

```text
EventsLog/
│
├── sdks/                    # Client SDKs
│   ├── node/                # Node.js SDK (Automatic instrumentation, loader hook)
│   ├── browser/             # Browser SDK (Future)
│   ├── python/              # Python SDK (Future)
│   ├── go/                  # Go SDK (Future)
│   ├── java/                # Java SDK (Future)
│   └── rust/                # Rust SDK (Future)
│
├── crates/                  # Shared Rust libraries
│   ├── protocol/            # Canonical event protocol models & types
│   ├── schema/              # Storage schemas & database models
│   ├── config/              # Shared configuration parser & validation
│   └── common/              # Common utilities
│
├── services/                # High-throughput Rust backend services
│   ├── ingestion/           # Event ingestion HTTP server & ClickHouse buffer
│   ├── query/               # Query API for functions, executions & traces
│   └── api/                 # Platform API (projects, environments, API keys)
│
├── storage/                 # Storage definitions
│   └── clickhouse/          # ClickHouse migrations, schemas & seeds
│
├── dashboard/               # Web UI Dashboard (React / Vite)
│
├── packages/                # Shared frontend packages & tooling
│   ├── ui/                  # Shared UI design system
│   └── config/              # Shared frontend configs
│
├── examples/                # Runnable demonstration applications
│   ├── node/                # Express / TypeScript examples
│   └── ...
│
├── docs/                    # Architecture, design & AI governance docs
│   ├── AI/                  # AI Agent goals, decisions, session state & tasks
│   └── ...
│
├── Cargo.toml               # Rust workspace manifest
├── package.json             # Root Node manifest
├── pnpm-workspace.yaml      # pnpm workspace definition
└── LICENSE                  # Apache-2.0
```

---

## 3. Core Principles

1. **Zero Business-Code Changes**: Observability must not require changing or polluting application business logic.
2. **Observability Failure != Application Failure**: If EventsLog ingestion or storage fails, the host application continues running without disruption. Events are dropped gracefully without memory leaks.
3. **Protocol-First**: All language SDKs conform to a unified event protocol defined in `crates/protocol`.
4. **Privacy by Default**: Sensitive parameters (tokens, passwords, keys) are sanitized before transmission.
5. **Bounded Resources**: Strict limits on payload sizes, execution queues, and memory usage.

---

## 4. Quickstart

### Prerequisites
- **Rust**: 1.80+ (`cargo`)
- **Node.js**: 20+ (`node`)
- **Package Manager**: `pnpm` 9+

### Building Rust Backend
```bash
# Check all Rust crates and services
cargo check --workspace

# Run Rust unit tests
cargo test --workspace
```

### Building Node Packages & SDKs
```bash
# Install workspace dependencies
pnpm install

# Build all packages
pnpm build
```

---

## 5. License

EventsLog is licensed under the [Apache-2.0 License](LICENSE).
