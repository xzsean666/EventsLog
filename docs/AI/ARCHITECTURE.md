# EventsLog — Architecture Design

## 1. Overview

**EventsLog is a Zero-Code Function Observability Platform.**

EventsLog allows developers to observe application functions without modifying business code.

Developers configure which Functions / Callables should be observed. EventsLog automatically instruments the application and collects:

* Function
* Input
* Output
* Duration
* Status
* Error
* Trace
* Parent / Child Functions
* Service
* Environment

The core principle is:

> **Business code should not need to change for observability.**

---

# 2. Product Model

```text
Business Code
     │
     │ unchanged
     ▼
EventsLog Configuration
     │
     ▼
Automatic Instrumentation
     │
     ▼
Function Observability
     │
     ├── Input
     ├── Output
     ├── Duration
     ├── Status
     ├── Error
     └── Trace
```

The intended user experience is:

```text
Install
   ↓
Configure
   ↓
Run
   ↓
Open EventsLog
   ↓
See Functions
   ↓
Inspect Execution
   ↓
Inspect Input / Output
   ↓
Inspect Trace
```

---

# 3. Repository Architecture

EventsLog uses a **monorepo architecture**.

The repository is organized into several major areas:

```text
eventslog/
│
├── sdks/                    # Client SDKs
│   ├── node/                # Node.js SDK
│   ├── browser/             # Browser SDK
│   ├── python/              # Python SDK
│   ├── go/                  # Go SDK
│   ├── java/                # Java SDK
│   └── rust/                # Rust SDK
│
├── crates/                  # Shared Rust libraries
│   ├── protocol/            # Event protocol
│   ├── schema/              # Shared data schemas
│   ├── config/              # Configuration model
│   └── common/              # Common Rust utilities
│
├── services/                # EventsLog backend services
│   ├── ingestion/           # Event ingestion service
│   ├── query/               # Query API
│   └── api/                 # Platform API
│
├── storage/                 # Storage layer
│   └── clickhouse/          # ClickHouse schema / migrations / configuration
│
├── dashboard/               # Web Dashboard
│
├── packages/                # Shared frontend / tooling packages
│   ├── ui/                  # Shared UI components
│   └── config/              # Shared frontend configuration
│
├── examples/                # Example applications
│   ├── node/
│   ├── python/
│   └── ...
│
├── docs/                    # Documentation
│
├── scripts/                 # Development / build scripts
│
├── deploy/                  # Deployment configuration
│
├── Cargo.toml
├── Cargo.lock
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── LICENSE
```

The repository should be structured around **product boundaries**, rather than around individual implementation technologies.

---

# 4. SDK Architecture

The `sdks/` directory contains all client-side SDKs.

```text
sdks/
├── node/
├── browser/
├── python/
├── go/
├── java/
└── rust/
```

Each SDK is independently versioned and packaged for its target ecosystem while following the shared EventsLog protocol.

---

## 4.1 Node.js SDK

Node.js is the first implementation target.

```text
sdks/node/
├── src/
│   ├── instrumentation/
│   ├── runtime/
│   ├── tracing/
│   ├── capture/
│   ├── sanitization/
│   ├── sampling/
│   ├── batching/
│   ├── transport/
│   └── config/
│
├── tests/
├── examples/
├── package.json
└── README.md
```

The Node.js SDK is responsible for:

* Automatic Function Instrumentation
* Function Execution Observation
* Trace Context
* Input / Output Capture
* Sanitization
* Sampling
* Batching
* Event Transmission

Business applications should not need to import or call instrumentation APIs for normal Function Observability.

---

## 4.2 Future SDKs

Other SDKs follow the same conceptual structure:

```text
sdks/
├── browser/
├── python/
├── go/
├── java/
└── rust/
```

The implementation details may differ by language, but all SDKs must conform to the common EventsLog:

* Event Model
* Function Model
* Trace Model
* Configuration Model
* Protocol

This allows different SDKs to send compatible Events to the same backend.

---

# 5. Rust Backend

The EventsLog backend is implemented in Rust.

Backend services are located under:

```text
services/
```

Shared Rust libraries are located under:

```text
crates/
```

This separation keeps reusable domain / protocol code independent from deployable services.

---

# 6. Rust Services

Initial backend services:

```text
services/
├── ingestion/
├── query/
└── api/
```

## 6.1 Ingestion Service

```text
services/ingestion/
├── src/
├── tests/
├── Cargo.toml
└── README.md
```

Responsibilities:

* Receive Events from SDKs
* Authentication
* Validation
* Normalization
* Short-term buffering
* Write Events to ClickHouse

The ingestion service should be stateless from an application perspective and horizontally scalable.

---

## 6.2 Query Service

```text
services/query/
├── src/
├── tests/
├── Cargo.toml
└── README.md
```

Responsibilities:

* Function queries
* Function execution queries
* Event queries
* Trace queries
* Error queries
* Statistics
* Performance analysis

The Dashboard communicates with the Query Service rather than directly accessing ClickHouse.

---

## 6.3 API Service

```text
services/api/
├── src/
├── tests/
├── Cargo.toml
└── README.md
```

The API service represents platform-level APIs such as:

* Projects
* Environments
* API Keys
* Configuration
* Access Control

The exact boundary between `api` and `query` may evolve as the platform grows.

---

# 7. Shared Rust Crates

Shared Rust libraries are located under:

```text
crates/
├── protocol/
├── schema/
├── config/
└── common/
```

## 7.1 Protocol

```text
crates/protocol/
```

Defines the EventsLog communication protocol.

It represents concepts such as:

* Event
* Event Type
* Function
* Execution
* Trace
* Error
* Attributes

The protocol is shared conceptually across all SDKs and backend services.

---

## 7.2 Schema

```text
crates/schema/
```

Contains shared data definitions used by backend services.

The schema layer represents the canonical EventsLog data model.

---

## 7.3 Config

```text
crates/config/
```

Contains shared configuration models and configuration semantics used by backend components.

---

## 7.4 Common

```text
crates/common/
```

Contains backend-wide utilities that are genuinely shared between services.

It should not become a dumping ground for service-specific business logic.

---

# 8. ClickHouse Storage

ClickHouse is the primary EventsLog storage system.

Storage-related resources are located under:

```text
storage/clickhouse/
```

Recommended structure:

```text
storage/
└── clickhouse/
    ├── migrations/
    ├── schema/
    ├── seeds/
    ├── config/
    └── README.md
```

The ClickHouse layer is responsible for the persistent storage model of:

* Events
* Function Executions
* Traces
* Errors
* Function Statistics
* Other observability data

Backend services access ClickHouse through their own storage/query boundaries.

The Dashboard must not access ClickHouse directly.

---

# 9. Dashboard

The Dashboard is the primary user interface.

```text
dashboard/
├── src/
│   ├── pages/
│   ├── components/
│   ├── features/
│   └── routes/
│
├── tests/
├── package.json
└── README.md
```

Initial product areas:

```text
Overview
Functions
Function Executions
Events
Traces
Errors
```

The primary investigation flow is:

```text
Function
   ↓
Function Executions
   ↓
Execution Details
   ├── Input
   ├── Output
   ├── Duration
   ├── Status
   └── Error
   ↓
Trace
   ↓
Child Functions
```

---

# 10. Shared Frontend Packages

Reusable frontend components and tooling may live under:

```text
packages/
├── ui/
└── config/
```

For example:

```text
packages/ui/
```

contains shared Dashboard UI components.

This prevents the Dashboard from becoming a monolithic frontend package as the platform grows.

---

# 11. Examples

Example applications are stored under:

```text
examples/
```

Example:

```text
examples/
├── node/
│   ├── basic/
│   ├── express/
│   └── typescript/
│
├── python/
├── go/
└── java/
```

Examples should demonstrate:

* SDK installation
* Configuration
* Function selection
* Function Observability
* Trace behavior
* Error handling

Examples should be treated as integration references rather than production application code.

---

# 12. Documentation

Documentation lives under:

```text
docs/
```

Recommended structure:

```text
docs/
├── architecture/
│   ├── architecture.md
│   ├── event-model.md
│   ├── trace-model.md
│   └── sdk-architecture.md
│
├── sdk/
│   └── node/
│
├── configuration/
│
├── deployment/
│
└── development/
```

The architecture documentation should describe system boundaries and responsibilities without coupling the product design to specific implementation details.

---

# 13. Deployment

Deployment-related resources live under:

```text
deploy/
```

Example:

```text
deploy/
├── docker/
├── kubernetes/
├── helm/
└── environments/
```

Deployment configuration should remain separate from application source code.

---

# 14. Repository Dependency Model

The intended dependency direction is:

```text
                   ┌──────────────┐
                   │   Protocol   │
                   │    Schema    │
                   └──────┬───────┘
                          │
             ┌────────────┼────────────┐
             │            │            │
             ▼            ▼            ▼
          SDKs         Services     Storage
             │            │
             │            ▼
             │        ClickHouse
             │
             ▼
        Applications


Dashboard
    │
    ▼
Query / API Services
    │
    ▼
ClickHouse
```

The key dependency rules are:

1. SDKs depend on the EventsLog protocol.
2. Backend services depend on shared backend models.
3. Backend services own access to ClickHouse.
4. Dashboard communicates through API / Query services.
5. Dashboard does not directly depend on ClickHouse.
6. Business applications depend only on their language SDK.
7. Business applications do not depend on EventsLog backend services.

---

# 15. Runtime Architecture

The runtime architecture is:

```text
┌──────────────────────────────────────┐
│           Application                │
│                                      │
│  Business Functions / Services       │
└──────────────────┬───────────────────┘
                   │
                   │ Automatic Instrumentation
                   ▼
┌──────────────────────────────────────┐
│             EventsLog SDK            │
│                                      │
│ Function Observation                 │
│ Trace                                │
│ Input / Output                       │
│ Sanitization                         │
│ Sampling                             │
│ Batching                             │
└──────────────────┬───────────────────┘
                   │
                   │ HTTPS
                   ▼
┌──────────────────────────────────────┐
│        Rust Ingestion Service        │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│              ClickHouse              │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│       Rust Query / API Services      │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│              Dashboard               │
└──────────────────────────────────────┘
```

---

# 16. Initial Implementation Scope

The first release should focus on:

```text
                    EventsLog
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    Node.js SDK     Rust Backend   Dashboard
        │              │
        │              ▼
        │          ClickHouse
        │
        ▼
Automatic Function
Instrumentation
```

Initial implementation:

```text
sdks/node
crates/protocol
crates/schema
crates/config
services/ingestion
services/query
storage/clickhouse
dashboard
examples/node
docs
```

Other language SDK directories may be introduced as their implementations begin.

---

# 17. Function Observability Model

EventsLog treats the Function as the primary observability unit.

```text
Function
   │
   ├── Function Identity
   │
   └── Executions
         │
         ├── Input
         ├── Output
         ├── Duration
         ├── Status
         ├── Error
         └── Trace
```

A Trace connects multiple Function Executions:

```text
Trace
│
├── OrderService.createOrder
│
├── UserService.getUser
│
├── PaymentService.createPayment
│   └── PaymentGateway.charge
│
└── OrderRepository.save
```

This model is the foundation of the EventsLog product.

---

# 18. Function Selection

Configuration supports selecting Functions at multiple levels.

```yaml
instrumentation:
  include:
    - "OrderService.*"
    - "PaymentService.create"
    - "src/services/**/*.ts"

  exclude:
    - "*.toJSON"
    - "*.serialize"
```

Supported concepts include:

* Function
* Class
* Method
* Module
* Directory
* Glob / Pattern
* Include
* Exclude

Exclude rules take precedence over include rules.

---

# 19. Reliability Principles

EventsLog follows:

> **Observability failure != Application failure**

If EventsLog becomes unavailable:

```text
Network Failure
Server Failure
ClickHouse Failure
SDK Transmission Failure
```

the business application must continue running.

The SDK may drop observability events when required.

It must not:

* crash the application
* block business execution indefinitely
* introduce unbounded memory growth
* propagate observability failures into business logic

---

# 20. Security and Privacy

The platform must provide:

* API Authentication
* Project Isolation
* Environment Isolation
* Access Control
* Payload Limits
* Data Sanitization
* Sampling

Sensitive data must be sanitized before transmission.

Example fields include:

```text
password
token
accessToken
refreshToken
authorization
cookie
secret
apiKey
creditCard
```

---

# 21. Performance Principles

The SDK and backend should prioritize:

* Asynchronous processing
* Non-blocking behavior
* Batching
* Sampling
* Bounded memory
* Payload limits
* Efficient serialization

Observability should remain an auxiliary subsystem and should not become part of the application's critical business path.

---

# 22. Acceptance Criteria

An existing Node.js application should be observable without modifying its business code.

Given:

```yaml
instrumentation:
  include:
    - "OrderService.*"
    - "PaymentService.*"
    - "UserService.*"
```

EventsLog should automatically expose:

```text
OrderService.createOrder
OrderService.cancelOrder
OrderService.getOrder

PaymentService.create
...

UserService.getUser
...
```

For an individual execution:

```text
OrderService.createOrder
```

the Dashboard should provide:

```text
Input
Output
Duration
Status
Error
Trace
Child Functions
```

The platform should also support:

```text
Function Statistics
Function Executions
Execution Details
Trace Investigation
Error Investigation
```

---

# 23. Design Principles

### 1. Zero Business-Code Changes
Observability should not require changes to business logic.

### 2. Function First
Function / Callable is the primary unit of observability.

### 3. Execution Is the Source of Truth
Function statistics are aggregations of Function Executions.

### 4. Trace Connects Executions
Related executions should be connected into an execution tree.

### 5. Protocol First
All SDKs and backend components should follow a shared Event Protocol.

### 6. Observability Is Non-Critical
EventsLog must never become a critical dependency of the application.

### 7. Privacy by Default
Sensitive information must be controllable and sanitized before transmission.

### 8. Bounded Resources
Memory, payload size, network traffic, and event volume must have explicit limits.

### 9. Simple Infrastructure
The initial architecture should avoid unnecessary distributed infrastructure.

### 10. Multi-Language From Day One
The repository and protocol should be designed for multiple SDKs even though Node.js is the first implementation.

---

# 24. Final Architecture

The final EventsLog architecture can be summarized as:

```text
                           EventsLog
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
      SDKs                  Backend                Dashboard
        │                      │                      │
        │                ┌─────┴─────┐                │
        │                │           │                │
        │                ▼           ▼                │
        │            Ingestion     Query/API ◄────────┘
        │                │           │
        │                └─────┬─────┘
        │                      │
        │                      ▼
        │                 ClickHouse
        │
        ▼
Application
```
