# TASK-017: Node.js SDK Configuration Parser & Matcher

## Objective
Implement configuration discovery, YAML/JSON loading, and pattern matching logic in `@eventslog/node` to configure which functions/modules are instrumented and set runtime auto-batching parameters.

## Scope
- Implement configuration loader in `sdks/node/src/config/loader.ts`:
  - Locate `eventslog.yaml`, `eventslog.json`, or environment variables (`EVENTSLOG_ENDPOINT`, `EVENTSLOG_API_KEY`).
  - Parse `batching` configuration:
    - `max_batch_size`: number of records to trigger auto-batch (default: `100`).
    - `flush_interval_ms`: maximum millisecond delay before auto-batching (default: `500`).
    - `max_queue_size`: maximum items in memory before dropping (default: `5000`).
  - Provide sensible defaults if configuration file is absent.
- Implement rule matcher in `sdks/node/src/config/matcher.ts`:
  - Support glob/wildcard patterns (e.g., `OrderService.*`, `src/services/**/*.ts`).
  - Evaluate include vs exclude rules, where exclude strictly takes precedence.
- Unit tests validating pattern matching rules, configuration loading, and batching config defaults.

## Allowed Files
- `sdks/node/src/config/**`
- `sdks/node/tests/config/**`
- `docs/AI/SESSION_STATE.md`
- `docs/AI/TASK_INDEX.md`
- `docs/AI/tasks/TASK-017.md`

## Dependencies
- TASK-016

## Inputs and Outputs
- **Inputs**: User configuration file or environment variables.
- **Outputs**: Resolved runtime configuration with auto-batch parameters and fast `isObserved(moduleName, functionName)` evaluation function.

## Acceptance Criteria
1. Configuration loads from YAML/JSON file and environment variables.
2. Batching configuration (`max_batch_size`, `flush_interval_ms`, `max_queue_size`) is parsed with documented defaults.
3. Wildcard matching supports classes, methods, and modules.
4. Exclude rules take precedence over include rules.
5. Unit tests pass with 100% assertions.

## Verification Commands
- `pnpm --filter @eventslog/node test config`

## Risks and Assumptions
- Use a lightweight glob matching helper without heavy external dependencies.

## Status
DONE

