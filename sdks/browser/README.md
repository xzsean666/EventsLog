# @eventslog/browser

Client-side Function Observability and Distributed Tracing SDK for modern Web Browsers, Single Page Applications (SPAs), React, and Vue.

---

## Key Highlights

- **Zero Node Dependencies**: Pure TypeScript designed for modern browsers, Vite, Webpack, and Rollup.
- **Distributed Trace Propagation**: Automatically patches `window.fetch` and injects `X-Trace-Id`, `X-Span-Id`, and `traceparent` headers into outgoing backend requests, establishing an end-to-end trace tree across Frontend and Backend services (Node.js, Rust).
- **Dual Transport Engine**:
  - Regular batches delivered via `fetch(endpoint, { keepalive: true })`.
  - Seamless page unload flushing using `navigator.sendBeacon` upon `pagehide` and `visibilitychange`.
- **First-Class Framework Integrations**:
  - **React**: `<EventsLogErrorBoundary />`, `useTrace()`, `useTracedCallback()`, `withTracing()`.
  - **Vue**: `createEventsLogVue()` plugin capturing `app.config.errorHandler` and `trackVueRouter()`.
- **Zero-Code Interceptors**:
  - Global uncaught error (`window.onerror`) and unhandled Promise rejection monitoring.
  - Optional `console` interception (`console.log`, `console.warn`, `console.error`) tied to active execution spans.
- **Data Privacy & Security**:
  - Automatically redacts sensitive keys (`password`, `token`, `auth`, `api_key`, `cookie`, etc.).
  - Pattern detection for sensitive values (`Bearer tokens`, `JWTs`, `credit cards`).

---

## Installation

```bash
pnpm add @eventslog/browser
# or
npm install @eventslog/browser
```

---

## Quickstart

### 1. Initialization (Vanilla JS / Generic SPA)

```typescript
import { init, startSpan, traceAsync } from '@eventslog/browser';

// Initialize at application entrypoint
init({
  serviceName: 'my-frontend-app',
  environment: 'production',
  endpoint: 'http://localhost:8001/v1/events',
  apiKey: 'optional-ingestion-key',
  captureFetch: true,  // Automatically inject distributed trace headers
  captureErrors: true, // Automatically capture unhandled window errors
});

// Explicit function tracing
const result = startSpan('calculateTotal', () => {
  return cart.reduce((sum, item) => sum + item.price, 0);
});

// Async function tracing
const user = await traceAsync('fetchUserProfile', async () => {
  const res = await fetch('/api/user/profile');
  return res.json();
});
```

---

### 2. React Integration (`@eventslog/browser/react`)

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { init } from '@eventslog/browser';
import { EventsLogErrorBoundary, useTracedCallback, withTracing } from '@eventslog/browser/react';

init({
  serviceName: 'react-shop-app',
  endpoint: 'http://localhost:8001/v1/events',
});

function SubmitButton({ onClick }: { onClick: () => void }) {
  // Trace click events seamlessly
  const handleClick = useTracedCallback('button.submit_order', onClick);
  return <button onClick={handleClick}>Submit Order</button>;
}

// Trace component render execution
const OrderView = withTracing(function OrderView() {
  return (
    <div>
      <h2>Order Details</h2>
      <SubmitButton onClick={() => console.log('Order submitted')} />
    </div>
  );
}, 'OrderView');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Catch rendering errors with component stacks */}
    <EventsLogErrorBoundary componentName="RootBoundary">
      <OrderView />
    </EventsLogErrorBoundary>
  </React.StrictMode>
);
```

---

### 3. Vue Integration (`@eventslog/browser/vue`)

```typescript
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { init } from '@eventslog/browser';
import { createEventsLogVue } from '@eventslog/browser/vue';
import App from './App.vue';

init({
  serviceName: 'vue-admin-portal',
  endpoint: 'http://localhost:8001/v1/events',
});

const router = createRouter({
  history: createWebHistory(),
  routes: [/* ... */],
});

const app = createApp(App);

// Automatically captures component errors and page navigation spans
app.use(createEventsLogVue({ router }));
app.use(router);
app.mount('#app');
```

---

## Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `serviceName` | `string` | *(Required)* | Identity of your frontend web service. |
| `environment` | `string` | `'production'` | Target environment (`staging`, `production`, `local`). |
| `endpoint` | `string` | `'http://localhost:8001/v1/events'` | EventsLog Ingestion service URL. |
| `apiKey` | `string` | `undefined` | Optional ingest authentication key (`X-API-Key`). |
| `batchSize` | `number` | `30` | Maximum events buffered before auto-flush. |
| `flushIntervalMs` | `number` | `5000` | Flush interval timer in milliseconds. |
| `maxQueueSize` | `number` | `1000` | In-memory buffer size before dropping oldest events. |
| `captureFetch` | `boolean` | `true` | Intercepts `window.fetch` and propagates trace headers. |
| `captureErrors` | `boolean` | `true` | Captures global uncaught exceptions and Promise rejections. |
| `captureConsole` | `boolean` | `false` | Captures `console.log/warn/error` within active spans. |
| `sanitizeKeys` | `string[]` | `[]` | Additional case-insensitive keys to redact. |
| `maxPayloadBytes`| `number` | `32768` | Maximum payload size in bytes before truncation. |
| `disabled` | `boolean` | `false` | Master disable flag. |
