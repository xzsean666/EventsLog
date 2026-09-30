# TASK-037: Web Dashboard Multi-Provider Data Source & Embedded DevTools (`dashboard`, `sdks/browser`)

## Subsystem
Frontend Dashboard (`dashboard`) & Browser Client SDK (`sdks/browser`)

## Milestone
Milestone 14: Local Storage Mode (SQLite & IndexedDB)

## Status
DONE

## Dependencies
- `TASK-035`: Node.js SDK In-Process SQLite Local Mode (`sdks/node`)
- `TASK-036`: Browser SDK In-Browser IndexedDB Local Mode (`sdks/browser`)

## Verification Criteria
- Unified `TelemetryDataProvider` interface defined in `dashboard/src/api/provider.ts` with implementations:
  - `HttpDataProvider`: Supports remote ClickHouse query service and local Rust SQLite service (`http://localhost:8080`).
  - `IndexedDBDataProvider`: Connects directly to in-browser `IndexedDB` (`eventslog_db`), translating local storage records into dashboard models without network calls.
- Topbar Data Source Switcher in `dashboard/src/components/Topbar.tsx`:
  - Visual selector allowing users to switch between Remote Query Service, Local SQLite Service, and In-Browser IndexedDB.
  - Automatically re-queries active provider upon selection.
- Embedded DevTools in `sdks/browser`:
  - Floating drawer / modal overlay (`mountDevTools` or `devtools: true` in `BrowserConfig`) for frontend web applications.
  - Displays real-time function executions, latency waterfall, error diagnostics, and clear storage actions directly within the web page.
- Comprehensive unit tests:
  - `dashboard/tests/provider.test.ts` covering multi-provider abstraction and IndexedDB provider translation.
  - `sdks/browser/tests/devtools.test.ts` covering devtools mounting, event rendering, and storage controls.
- Full workspace builds and tests pass cleanly (`pnpm -r run test`, `cargo test --workspace`).

## Problem Statement
Currently, the Web Dashboard is strictly coupled to a remote HTTP API client (`EventsLogApiClient`). When developers use local storage modes (SQLite local service on port 8080, or in-browser IndexedDB), the dashboard must seamlessly support querying these local data sources. Furthermore, for frontend developers building React/Vue/vanilla web apps, having an in-page embedded DevTools overlay attached to `@eventslog/browser` allows instant zero-setup inspection of function calls, errors, and traces right within their application window without opening a separate dashboard tab.

## Scope of Work
1. **Multi-Provider Data Source Architecture (`dashboard/src/api/provider.ts`)**:
   - Define `TelemetryDataProvider` contract.
   - Implement `HttpDataProvider` supporting configurable endpoints (`http://localhost:8002` remote, `http://localhost:8080` local).
   - Implement `IndexedDBDataProvider` reading from browser `IndexedDB`.
   - Implement `ProviderRegistry` managing active provider state and auto-detection.
2. **Dashboard UI Integration**:
   - Add data source selection dropdown to `dashboard/src/components/Topbar.tsx`.
   - Update `dashboard/src/App.tsx` and views to use active `TelemetryDataProvider`.
3. **Embedded DevTools for Browser SDK (`sdks/browser`)**:
   - Create `sdks/browser/src/devtools/index.ts` providing in-page floating widget & drawer.
   - Add `devtools?: boolean` option to `BrowserConfig` in `sdks/browser/src/protocol/types.ts`.
   - Auto-mount DevTools when `devtools: true` is configured in `EventsLogBrowserClient`.
4. **Testing & Verification**:
   - Write tests in `dashboard/tests/provider.test.ts` and `sdks/browser/tests/devtools.test.ts`.
   - Verify `pnpm -r run test` and `pnpm -r run build`.

## Implementation Details
- Built `TelemetryDataProvider` multi-provider architecture in `dashboard/src/api/provider.ts`:
  - `HttpDataProvider`: Supports remote service and local Rust SQLite service (`http://localhost:8080`).
  - `IndexedDBDataProvider`: Directly queries browser `IndexedDB` (`eventslog_db`), translating local storage records into dashboard models without network calls.
  - `ProviderRegistry`: Pre-registers `remote`, `local_sqlite`, and `indexeddb` providers, managing active provider state.
- Integrated interactive Data Source switcher in `dashboard/src/components/Topbar.tsx` with provider-specific icons and real-time re-querying in `dashboard/src/App.tsx` and `FunctionsView.tsx`.
- Implemented embedded DevTools widget in `sdks/browser/src/devtools/index.ts`:
  - Floating trigger button and responsive slide-up drawer showing recent function calls, latency, errors, input/output inspection, and storage controls.
  - Automatically mounted via `devtools: true` in `BrowserConfig` or programmatic `mountDevTools()`.
- Added unit test suites:
  - `dashboard/tests/provider.test.ts` (5 tests passing).
  - `sdks/browser/tests/devtools.test.ts` (3 tests passing).
- Verified production builds (`tsc && vite build`, `tsup`) and all 106 JS/TS and 54 Rust workspace tests pass.

