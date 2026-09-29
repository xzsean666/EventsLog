import { BrowserConfig, Attributes } from './protocol/types';
import { EventsLogBrowserClient } from './client';
import { defaultContextManager } from './tracing/context';

declare global {
  // eslint-disable-next-line no-var
  var __EVENTSLOG_BROWSER_CLIENT__: EventsLogBrowserClient | undefined;
}

/**
 * Initializes the EventsLog Browser SDK with the provided configuration.
 */
export function init(config: BrowserConfig): EventsLogBrowserClient {
  if (globalThis.__EVENTSLOG_BROWSER_CLIENT__) {
    globalThis.__EVENTSLOG_BROWSER_CLIENT__.destroy();
  }
  const client = new EventsLogBrowserClient(config);
  globalThis.__EVENTSLOG_BROWSER_CLIENT__ = client;
  return client;
}

/**
 * Returns the currently active global EventsLog browser client.
 */
export function getClient(): EventsLogBrowserClient | undefined {
  return globalThis.__EVENTSLOG_BROWSER_CLIENT__;
}

/**
 * Executes a function within a new traced span.
 */
export function startSpan<T>(name: string, fn: () => T, attributes?: Attributes): T {
  const client = getClient();
  if (client) {
    return client.startSpan(name, fn, attributes);
  }
  return fn();
}

/**
 * Executes an async function within a new traced span.
 */
export async function traceAsync<T>(name: string, fn: () => Promise<T>, attributes?: Attributes): Promise<T> {
  const client = getClient();
  if (client) {
    return client.traceAsync(name, fn, attributes);
  }
  return fn();
}

/**
 * Wraps a function so every invocation is automatically tracked.
 */
export function wrapFunction<F extends (...args: any[]) => any>(fn: F, name?: string): F {
  const client = getClient();
  if (client) {
    return client.wrapFunction(fn, name);
  }
  return fn;
}

/**
 * Manually captures an error and transmits it to EventsLog.
 */
export function captureError(error: unknown, attributes?: Attributes): void {
  const client = getClient();
  if (client) {
    client.captureError(error, attributes);
  }
}

/**
 * Flushes all pending buffered events immediately.
 */
export async function flush(): Promise<void> {
  const client = getClient();
  if (client) {
    await client.flush();
  }
}

// Re-exports
export * from './protocol/types';
export * from './tracing/context';
export * from './sanitization/sanitizer';
export * from './transport/buffer';
export * from './client';
export { defaultContextManager };
