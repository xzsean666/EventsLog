# TASK-032: Flutter / Dart Full-Stack End-to-End Simulation & Verification

## Subsystem
`tests/e2e`, `examples/flutter`, `sdks/flutter`, and Rust backend services

## Milestone
Milestone 12: Mobile Client Observability (Flutter / Dart)

## Status
DONE

## Dependencies
- `TASK-007`: ClickHouse Schema & Production Configuration
- `TASK-011`: Ingestion Service ClickHouse Batched Writer
- `TASK-014`: Query Service Function, Execution & Trace APIs
- `TASK-030`: Comprehensive Real-World End-to-End Simulation
- `TASK-031`: Flutter / Dart Client SDK & AST Instrumentation CLI

## Verification Results
- `./scripts/run_flutter_e2e.sh`: 100% of all 6 checks passed:
  1. ClickHouse Function Executions (6/6 persisted).
  2. Function Catalog (All 6 methods discovered).
  3. Multi-Level Distributed Trace Reconstruction (Dart Zone async context propagation verified with 4 child spans under `CheckoutWorkflow.executeCheckout`).
  4. Arguments Capture Fidelity (`userId`, `sku`, `quantity`, `totalAmount`).
  5. Return Value Capture Fidelity (`order_id`, `payment_status`, `card_valid`).
  6. Exception & Stack Trace Capture (`StateError`, error message, and Dart stack trace).
- Source Code Cleanliness: 0 Git modifications remaining after `restore`.
- Full monorepo suites: `pnpm -r run test` (80 passed) and `cargo test --workspace` (48 passed).


## Problem Statement
To ensure enterprise-grade reliability and production-readiness of the Flutter/Dart observability subsystem, a complete real-world End-to-End simulation is required:
1. Test the AST Instrumentation CLI on a genuine Dart application containing multi-level asynchronous business services, nested function calls, error handlers, and arrow functions.
2. Execute the instrumented Dart application using the real Dart VM runtime (`dart run`).
3. Verify that telemetry payloads are transmitted via HTTP to the live Rust Ingestion Service, validated, buffered, and persisted into ClickHouse.
4. Query ClickHouse and the Rust Query API to assert:
   - Accurate function catalog and execution counts.
   - Exact argument capture and return value serialization.
   - Proper status tracking (`success` and `error` with stack trace).
   - Distributed trace tree reconstruction verifying that Dart `Zone` context propagation maintains parent-child span linkage across asynchronous `Future` chains.
5. Verify source code restoration ensuring zero Git diff contamination after execution.

## Scope of Work
1. **Dart E2E Application Tier (`tests/e2e/dart_app/` or `examples/flutter/`)**:
   - `services/inventory_service.dart`: Stock reservation.
   - `services/order_service.dart`: Order creation and failure scenarios.
   - `services/payment_service.dart`: Payment processing and card validation.
   - `workflows/checkout_workflow.dart`: Multi-level nested caller-callee async flow.
   - `main.dart`: Complete execution driver invoking all flows, capturing errors, and flushing batches.
2. **Automated E2E Simulation Orchestrator**:
   - Launch live Rust Ingestion (port 8094) and Query (port 8095) connected to ClickHouse.
   - Execute `@eventslog/flutter` AST CLI `inject`.
   - Run the instrumented Dart app using `dart run`.
   - Execute `@eventslog/flutter` AST CLI `restore` and verify bit-for-bit source file recovery.
   - Assert 6 rigorous verification checks against ClickHouse and Query Service:
     1. ClickHouse function executions count and table integrity.
     2. Function catalog coverage (all instrumented classes and methods).
     3. Multi-level distributed trace reconstruction via Query API (parent-child linkage).
     4. Argument capture fidelity (`input_json`).
     5. Return value capture fidelity (`output_json`).
     6. Error and stack trace capture for failed execution (`status = 'error'`).
3. **Execution Script**:
   - Add automated script `scripts/run_flutter_e2e.sh`.

## Verification Criteria
- All 6 verification checks pass with 100% success.
- Live Dart VM execution produces zero runtime crashes.
- Source code is 100% cleanly restored with zero Git changes.
