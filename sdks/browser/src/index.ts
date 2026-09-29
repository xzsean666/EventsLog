import { BrowserConfig, Attributes } from './protocol/types';
import { EventsLogBrowserClient } from './client';
import { defaultContextManager } from './tracing/context';

let globalClient: EventsLogBrowserClient | undefined;

/**
 * Initializes the EventsLog Browser SDK with the provided configuration.
 */
export function init(config: BrowserConfig): EventsLogBrowserClient {
  if (globalClient) {
    globalClient.destroy();
  }
  globalClient = new EventsLogBrowserClient(config);
  return globalClient;
}

/**
 * Returns the currently active global EventsLog browser client.
 */
export function getClient(): EventsLogBrowserClient | undefined {
  return globalClient;
}

/**
 * Executes a function within a new traced span.
 */
export function startSpan<T>(name: string, fn: () => T, attributes?: Attributes): T {
  if (globalClient) {
    return globalClient.startSpan(name, fn, attributes);
  }
  return fn();
}

/**
 * Executes an async function within a new traced span.
 */
export async function traceAsync<T>(name: string, fn: () => Promise<T>, attributes?: Attributes): Promise<T> {
  if (globalClient) {
    return globalClient.traceAsync(name, fn, attributes);
  }
  return fn();
}

/**
 * Wraps a function so every invocation is automatically tracked.
 */
export function wrapFunction<F extends (...args: any[]) => any>(fn: F, name?: string): F {
  if (globalClient) {
    return globalClient.wrapFunction(fn, name);
  }
  return fn;
}

/**
 * Manually captures an error and transmits it to EventsLog.
 */
export function captureError(error: unknown, attributes?: Attributes): void {
  if (globalClient) {
    globalClient.captureError(error, attributes);
  }
}

/**
 * Flushes all pending buffered events immediately.
 */
export async function flush(): Promise<void> {
  if (globalClient) {
    await globalClient.flush();
  }
}

// Re-exports
export * from './protocol/types';
export * from './tracing/context';
export * from './sanitization/sanitizer';
export * from './transport/buffer';
export * from './client';
export { defaultContextManager };
