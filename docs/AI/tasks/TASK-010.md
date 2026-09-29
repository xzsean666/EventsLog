# TASK-010: Ingestion Service Memory Batch Buffer & Drop Strategy

## Objective
Implement a bounded in-memory ring buffer inside `services/ingestion` to decouple the HTTP ingestion path from downstream storage writes, ensuring low latency, bounded memory usage, and safe drop policies under heavy backpressure.

## Scope
- Design concurrent ring buffer or mpsc channel worker in `services/ingestion/src/buffer.rs`:
  - Configurable maximum capacity (e.g., 50,000 events).
  - Configurable flush batch size (e.g., 1,000 events) and maximum flush delay (e.g., 200ms).
  - Explicit drop policy when buffer is full (drop oldest or drop newest) with metrics logging.
- Unit tests verifying buffer overflow handling, timer-triggered batch flushes, and size-triggered batch flushes.

## Allowed Files
- `services/ingestion/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-010.md`

## Dependencies
- TASK-009

## Inputs and Outputs
- **Inputs**: Incoming validated events from HTTP handlers.
- **Outputs**: Flushed event batches dispatched to consumer channels.

## Acceptance Criteria
1. Buffer accepts events without blocking the async HTTP thread.
2. Buffer flushes batches when either batch size threshold or max delay timeout occurs.
3. Overflow drops events gracefully without panic, out-of-memory crash, or deadlocks.
4. `cargo test -p eventslog-ingestion --lib buffer` passes.

## Verification Commands
- `cargo test -p eventslog-ingestion buffer`

## Risks and Assumptions
- Use `tokio::sync::mpsc` or `crossbeam` channel with `try_send` to guarantee non-blocking enqueue.

## Status
DONE
