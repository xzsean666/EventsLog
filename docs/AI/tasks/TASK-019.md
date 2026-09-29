# TASK-019: Node.js SDK Input/Output Capture, Sanitizer & Payload Limiter

## Objective
Implement safe parameter and return value serialization in `@eventslog/node`, enforcing sensitive field masking (passwords, tokens, authorization headers) and strict payload size limits.

## Scope
- Implement sanitization engine in `sdks/node/src/sanitization/sanitizer.ts`:
  - Recursive object traversal with circular reference detection (`WeakSet`).
  - Redaction of sensitive keys (e.g. `password`, `token`, `secret`, `authorization`, `creditCard`, `apiKey`) replaced with `"[REDACTED]"`.
  - Max string length and depth truncation.
  - Safe handling of non-serializable objects (Functions, Buffers, BigInt, Symbols).
- Implement size limiter in `sdks/node/src/sanitization/limiter.ts`:
  - Enforce maximum byte limits per captured payload (e.g. 64KB max).
- Unit tests covering deep objects, circular references, sensitive keys, and large arrays.

## Allowed Files
- `sdks/node/src/sanitization/**`
- `sdks/node/tests/sanitization/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-019.md`

## Dependencies
- TASK-017
- TASK-018

## Inputs and Outputs
- **Inputs**: Raw function arguments and return values of arbitrary types.
- **Outputs**: Sanitized, bounded JSON-safe representations.

## Acceptance Criteria
1. Sensitive fields are masked reliably regardless of case (`password`, `Password`, `PASS_WORD`).
2. Circular references do not cause stack overflow or exceptions.
3. Payloads exceeding configured limits are cleanly truncated with a notice.
4. Unit tests pass 100%.

## Verification Commands
- `pnpm --filter @eventslog/node test sanitization`

## Risks and Assumptions
- Serialization must be CPU-efficient and avoid blocking the Node.js event loop.

## Status
DONE

