# Task Index

This table lists all planned engineering tasks for EventsLog, structured by milestone and architectural layer.
State Machine: `TODO` -> `IN_PROGRESS` -> `REVIEW` -> `DONE` (or `BLOCKED`).

| Task ID | Title | Status | Dependencies | Target Subsystem |
| :--- | :--- | :--- | :--- | :--- |
| **Milestone 1: Repository Foundation & Core Protocol** | | | | |
| [TASK-001](tasks/TASK-001.md) | Monorepo Foundation & Root Workspace Configuration | DONE | None | Root Workspace |
| [TASK-002](tasks/TASK-002.md) | Multi-Language Directory Isolation & Comprehensive Task Roadmap Specification | DONE | TASK-001 | Repository Layout & AI Docs |
| [TASK-003](tasks/TASK-003.md) | Core Protocol & Event Data Models in Rust | DONE | TASK-001, TASK-002 | `crates/protocol` |
| [TASK-004](tasks/TASK-004.md) | Core Schema & Storage Record Models in Rust | DONE | TASK-003 | `crates/schema` |
| [TASK-005](tasks/TASK-005.md) | Shared Configuration Model in Rust | DONE | TASK-003 | `crates/config` |
| [TASK-006](tasks/TASK-006.md) | Shared Common Utilities in Rust | DONE | TASK-003 | `crates/common` |
| **Milestone 2: ClickHouse Storage Layer** | | | | |
| [TASK-007](tasks/TASK-007.md) | ClickHouse Schema, Docker Optimization & Production Configurations | DONE | TASK-004 | `storage/clickhouse` |
| **Milestone 3: Ingestion Service (Rust)** | | | | |
| [TASK-008](tasks/TASK-008.md) | Ingestion Service HTTP Skeleton & Health Check | DONE | TASK-003, TASK-005 | `services/ingestion` |
| [TASK-009](tasks/TASK-009.md) | Ingestion Service Event Ingestion Endpoint & Authentication | DONE | TASK-008 | `services/ingestion` |
| [TASK-010](tasks/TASK-010.md) | Ingestion Service Memory Batch Buffer & Drop Strategy | DONE | TASK-009 | `services/ingestion` |
| [TASK-011](tasks/TASK-011.md) | Ingestion Service ClickHouse Batched Writer | DONE | TASK-007, TASK-010 | `services/ingestion` |
| **Milestone 4: Query & Platform API Services (Rust)** | | | | |
| [TASK-012](tasks/TASK-012.md) | Query Service HTTP Skeleton & Routes | DONE | TASK-003, TASK-005 | `services/query` |
| [TASK-013](tasks/TASK-013.md) | Query Service ClickHouse Storage Client | DONE | TASK-007, TASK-012 | `services/query` |
| [TASK-014](tasks/TASK-014.md) | Query Service Function, Execution & Trace APIs | DONE | TASK-013 | `services/query` |
| [TASK-015](tasks/TASK-015.md) | Platform API Service Skeleton & Management Endpoints | DONE | TASK-003, TASK-005 | `services/api` |
| **Milestone 5: Node.js SDK (Client Observability)** | | | | |
| [TASK-016](tasks/TASK-016.md) | Node.js SDK Project Setup, Build & Protocol Types | DONE | TASK-001, TASK-002 | `sdks/node` |
| [TASK-017](tasks/TASK-017.md) | Node.js SDK Configuration Parser & Matcher | DONE | TASK-016 | `sdks/node` |
| [TASK-018](tasks/TASK-018.md) | Node.js SDK Tracing Context & AsyncLocalStorage | DONE | TASK-016 | `sdks/node` |
| [TASK-019](tasks/TASK-019.md) | Node.js SDK Input/Output Capture, Sanitizer & Payload Limiter | DONE | TASK-017, TASK-018 | `sdks/node` |
| [TASK-020](tasks/TASK-020.md) | Node.js SDK Instrumentation Engine & Method Interceptors | DONE | TASK-019 | `sdks/node` |
| [TASK-021](tasks/TASK-021.md) | Node.js SDK Auto-Batching Engine (Count/Time Triggers), Ring Buffer & Transport | DONE | TASK-020 | `sdks/node` |
| [TASK-022](tasks/TASK-022.md) | Node.js SDK Zero-Code Loader & Auto-Registration Hook | DONE | TASK-021 | `sdks/node` |
| **Milestone 6: Web Dashboard (Frontend)** | | | | |
| [TASK-023](tasks/TASK-023.md) | Dashboard Web Application Setup & API Client | DONE | TASK-001, TASK-002 | `dashboard` |
| [TASK-024](tasks/TASK-024.md) | Dashboard Function List, Execution Details & Trace Graph UI | DONE | TASK-014, TASK-023 | `dashboard` |
| **Milestone 7: End-to-End Integration & Demo** | | | | |
| [TASK-025](tasks/TASK-025.md) | End-to-End Integration Example & Full System Verification | DONE | TASK-011, TASK-014, TASK-022, TASK-024 | `examples/node` |
| **Milestone 8: System Hardening & Audit Remediation** | | | | |
| [TASK-026](tasks/TASK-026.md) | Comprehensive Audit Remediation: API Contract Alignment, SDK Robustness, Server Config & Storage Hardening | DONE | TASK-025 | Cross-System |
| [TASK-027](tasks/TASK-027.md) | Comprehensive System Optimization: Security Hardening, Hot-Path Performance & Zero-Code Console Log Capture | DONE | TASK-026 | Cross-System |
| **Milestone 9: Client Browser Observability SDK** | | | | |
| [TASK-028](tasks/TASK-028.md) | Browser SDK Implementation with React & Vue Integrations | DONE | TASK-027 | `sdks/browser` & `services/ingestion` |
| **Milestone 10: Full-Stack Audit Remediation & Hardening** | | | | |
| [TASK-029](tasks/TASK-029.md) | Comprehensive System Hardening & Optimization: Security, Performance, and Contract Alignment | DONE | TASK-028 | Cross-System |
| **Milestone 11: Real-World End-to-End Simulation & Verification** | | | | |
| [TASK-030](tasks/TASK-030.md) | Comprehensive Real-World End-to-End Simulation & Verification (React, Vue, NestJS, Ingestion, ClickHouse, and Query Services) | DONE | TASK-029 | End-to-End / Cross-System |
| **Milestone 12: Mobile Client Observability (Flutter / Dart)** | | | | |
| [TASK-031](tasks/TASK-031.md) | Flutter / Dart Client SDK & AST Instrumentation CLI (Source-Level Zero-Code) | DONE | TASK-003, TASK-016, TASK-030 | `sdks/flutter` & `examples/flutter` |
| [TASK-032](tasks/TASK-032.md) | Flutter / Dart Full-Stack End-to-End Simulation & Verification | DONE | TASK-007, TASK-011, TASK-014, TASK-031 | `tests/e2e`, `examples/flutter`, Cross-System |
| **Milestone 13: Documentation & Developer Experience Hardening** | | | | |
| [TASK-033](tasks/TASK-033.md) | Comprehensive Project Documentation Enhancement & Detailed README Overhaul | DONE | TASK-025, TASK-028, TASK-031, TASK-032 | `README.md` & Project Docs |
| **Milestone 14: Local Storage Mode (SQLite & IndexedDB)** | | | | |
| [TASK-034](tasks/TASK-034.md) | Rust Local Service with SQLite Storage Engine (`services/local`) | DONE | TASK-003, TASK-004, TASK-005, TASK-006, TASK-014 | `services/local` |
| [TASK-035](tasks/TASK-035.md) | Node.js SDK In-Process SQLite Local Mode | DONE | TASK-034, TASK-021 | `sdks/node` |
| [TASK-036](tasks/TASK-036.md) | Browser SDK In-Browser IndexedDB Local Mode | DONE | TASK-035, TASK-028 | `sdks/browser` |
| [TASK-037](tasks/TASK-037.md) | Web Dashboard Multi-Provider Data Source & Embedded DevTools | DONE | TASK-035, TASK-036 | `dashboard`, `sdks/browser` |
| [TASK-038](tasks/TASK-038.md) | Local Mode Full-Stack End-to-End Simulation & Verification | DONE | TASK-034, TASK-035, TASK-036, TASK-037 | Cross-System |
| **Milestone 15: Full-Stack Audit Remediation & Comprehensive Optimization** | | | | |
| [TASK-039](tasks/TASK-039.md) | Full-Stack Audit Remediation & Comprehensive System Optimization | DONE | TASK-038 | Cross-System |
| **Milestone 16: Mobile & Server Full-Stack Comprehensive Optimization** | | | | |
| [TASK-040](tasks/TASK-040.md) | Flutter SDK & Server-Side Full-Stack Comprehensive Optimization & Hardening | DONE | TASK-039 | Cross-System (`services/local`, `sdks/flutter`, `tests/e2e`) |

