# TASK-031: Flutter / Dart Client SDK & AST Instrumentation CLI (Source-Level Zero-Code)

## Subsystem
`sdks/flutter` & `examples/flutter`

## Milestone
Milestone 12: Mobile Client Observability (Flutter / Dart)

## Status
DONE

## Dependencies
- `TASK-003`: Core Protocol & Event Data Models in Rust
- `TASK-016`: Node.js SDK Project Setup, Build & Protocol Types
- `TASK-030`: Comprehensive Real-World End-to-End Simulation & Verification

## Verification Results
- `pnpm -C sdks/flutter run test`: 13/13 tests passed (100%).
- `pnpm -C sdks/flutter run build`: Builds cleanly into `dist/` (CJS, ESM, and TypeScript declarations).
- `pnpm -r run test`: All monorepo test suites pass with 100% success.
- CLI inject/status/restore verified on `examples/flutter`:
  - `inject`: 2 files / 6 functions instrumented, backup saved in `.eventslog_backup/`.
  - `status`: correctly reports INSTRUMENTED state.
  - `restore`: 2 files restored to exact initial bytes, backup cleanly removed.


## Problem Statement
In Flutter / Dart applications, Ahead-Of-Time (AOT) compilation and the omission of runtime reflection (`dart:mirrors`) prevent runtime dynamic monkey-patching. To achieve zero-code function observability, developers need a declarative, configuration-driven solution:
1. Specify an `eventslog.yaml` configuration describing which files, classes, and methods should be monitored.
2. An automated build-time AST transformer that parses Dart source files, injects tracing and error-capture logic without manual business-code modification, and maintains a safe backup/restore mechanism so that source files can be automatically restored after compilation without polluting Git version control.
3. A lightweight Flutter / Dart runtime SDK (`eventslog_flutter`) providing `Zone`-based asynchronous context propagation (preserving `trace_id` across `Future` and `Stream` chains), auto-batching (dual-trigger count and time flush), and bounded memory buffer reporting to the EventsLog Rust Ingestion Service.

## Scope of Work
1. **Flutter/Dart Runtime SDK (`sdks/flutter/lib/`)**:
   - `eventslog.dart`: Public API exports.
   - `src/config.dart`: Configuration model with defaults for endpoint, batch size, flush interval, etc.
   - `src/models.dart`: JSON event schema matching EventsLog ingestion protocol (`trace_id`, `span_id`, `parent_span_id`, `function_name`, `file_path`, `duration_us`, `status`, `input_payload`, `output_payload`, `error_message`, `service_name`, `environment`).
   - `src/zone.dart`: Asynchronous trace context propagation using Dart `Zone` and `ZoneValues`.
   - `src/span.dart`: Active span lifecycle (`finish`, `fail`).
   - `src/buffer.dart`: Dual-trigger auto-batching ring buffer with drop-on-overflow.
   - `src/transport.dart`: HTTP client transport with error handling.
   - `pubspec.yaml`: Dart package manifest.
2. **AST Instrumentation Engine & CLI (`sdks/flutter/src/` & `bin/`)**:
   - `src/config/loader.ts`: Parses and validates `eventslog.yaml`.
   - `src/matcher/matcher.ts`: Glob and regex pattern matching for files and functions.
   - `src/transformer/parser.ts`: Accurate Dart AST tokenizer/scanner for classes, methods, top-level functions, sync, async, and arrow (`=>`) bodies.
   - `src/transformer/rewriter.ts`: AST code rewriter inserting span creation, argument mapping, try/finally/catch blocks, and import injection.
   - `src/backup/backup_manager.ts`: Atomic snapshot backup to `.eventslog_backup/` and bit-for-bit restore.
   - `src/cli.ts`: CLI entrypoint providing commands: `inject`, `restore`, `run`, `status`.
   - `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.
3. **Automated Test Suite (`sdks/flutter/test/`)**:
   - Config loading & validation tests.
   - Matcher glob/regex tests.
   - AST transformer tests (sync methods, async methods, arrow functions, parameter extraction, idempotency check).
   - Backup & restore fidelity tests.
   - Full CLI workflow tests.
4. **Example Project (`examples/flutter/`)**:
   - Sample Flutter app with `eventslog.yaml` and services (`OrderService`, `PaymentService`).
5. **Documentation**:
   - `sdks/flutter/README.md` explaining setup, config syntax, CLI usage (`inject`, `restore`, `run`).

## Verification Criteria
- `pnpm -C sdks/flutter run test`: 100% tests pass.
- `pnpm -C sdks/flutter run build`: Builds cleanly into `dist/`.
- `pnpm -r run test`: All monorepo test suites pass without regression.
