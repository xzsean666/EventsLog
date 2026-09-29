# EventsLog Node.js SDK

**Language**: TypeScript / JavaScript (Node.js >= 20.0.0)  
**Package Manager**: `pnpm` (Workspace Member)

## Overview
The EventsLog Node.js SDK provides zero-code function observability for Node.js applications.

## Key Modules
- `src/config/`: Configuration parser and rule evaluation (include/exclude patterns).
- `src/tracing/`: Execution context propagation using Node.js `AsyncLocalStorage`.
- `src/sanitization/`: Sensitive field masking and bounded serialization.
- `src/instrumentation/`: Dynamic function wrapping and module monkey-patching.
- `src/sampling/`: Execution sampling policies.
- `src/batching/`: Bounded ring buffer with dual-trigger auto-batching (by record count threshold e.g. 100 or timer interval e.g. 500ms) and automatic graceful flush on process termination.
- `src/transport/`: Non-blocking HTTP transport to the Ingestion Service.
- `src/register.ts`: Node.js loader hook entry point for `--import` / `-r`.

## Language Isolation Rule
This package is strictly standard Node.js and TypeScript. No native Rust bindings or backend code are included here.
