/**
 * Span context maintaining distributed trace and span linkage.
 */
export interface SpanContext {
  /**
   * Distributed trace identifier (128-bit hex string, 32 characters).
   */
  traceId: string;
  /**
   * Current execution span identifier (64-bit hex string, 16 characters).
   */
  spanId: string;
  /**
   * Enclosing/parent execution span identifier, if any.
   */
  parentSpanId?: string;
}

/**
 * Standard HTTP header names for distributed trace propagation.
 */
export const TRACE_PARENT_HEADER = 'traceparent';
export const TRACE_ID_HEADER = 'x-trace-id';
export const SPAN_ID_HEADER = 'x-span-id';
export const PARENT_SPAN_ID_HEADER = 'x-parent-span-id';

/**
 * High-performance byte-to-hex lookup table.
 */
const BYTE_TO_HEX: string[] = [];
for (let i = 0; i < 256; i++) {
  BYTE_TO_HEX.push((i < 16 ? '0' : '') + i.toString(16));
}

/**
 * Generates a 128-bit random hex string for Trace IDs (32 characters).
 */
export function generateTraceId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let hex = '';
    for (let i = 0; i < 16; i++) {
      hex += BYTE_TO_HEX[bytes[i]];
    }
    return hex;
  }
  // Fallback for legacy runtimes
  return (
    Math.random().toString(16).substring(2, 10) +
    Math.random().toString(16).substring(2, 10) +
    Math.random().toString(16).substring(2, 10) +
    Math.random().toString(16).substring(2, 10)
  ).padEnd(32, '0');
}

/**
 * Generates a 64-bit random hex string for Span IDs (16 characters).
 */
export function generateSpanId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let hex = '';
    for (let i = 0; i < 8; i++) {
      hex += BYTE_TO_HEX[bytes[i]];
    }
    return hex;
  }
  // Fallback for legacy runtimes
  return (
    Math.random().toString(16).substring(2, 10) +
    Math.random().toString(16).substring(2, 10)
  ).padEnd(16, '0');
}

/**
 * Generates a standard UUID v4 string for event identifiers.
 */
export function generateEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Check if a value is a Promise-like object.
 */
function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as Promise<T>).then === 'function'
  );
}

/**
 * Browser-compatible distributed trace context manager.
 * Supports synchronous execution trees and Promise resolution chains.
 */
export class BrowserContextManager {
  private currentContext: SpanContext | undefined;
  private readonly contextStack: (SpanContext | undefined)[] = [];

  /**
   * Retrieves the currently active span context in the execution flow.
   */
  getCurrentSpan(): SpanContext | undefined {
    return this.currentContext;
  }

  /**
   * Runs a function synchronously or asynchronously within the given span context.
   */
  runInContext<T>(context: SpanContext | undefined, fn: () => T): T {
    const previousContext = this.currentContext;
    this.currentContext = context;
    this.contextStack.push(previousContext);

    try {
      const result = fn();

      if (isPromise(result)) {
        return (result.finally(() => {
          this.contextStack.pop();
          this.currentContext = previousContext;
        }) as unknown) as T;
      }

      this.contextStack.pop();
      this.currentContext = previousContext;
      return result;
    } catch (error) {
      this.contextStack.pop();
      this.currentContext = previousContext;
      throw error;
    }
  }

  /**
   * Creates a child span context under the currently active span (or root trace if none).
   */
  createChildSpan(traceId?: string): SpanContext {
    const parent = this.currentContext;
    const actualTraceId = traceId || parent?.traceId || generateTraceId();
    const spanId = generateSpanId();

    return {
      traceId: actualTraceId,
      spanId,
      parentSpanId: parent?.spanId,
    };
  }

  /**
   * Injects distributed tracing headers into an outgoing HTTP request headers object.
   */
  injectTraceHeaders(
    headers: Record<string, string> | Headers,
    context?: SpanContext
  ): void {
    const ctx = context || this.currentContext;
    if (!ctx) return;

    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      headers.set(TRACE_ID_HEADER, ctx.traceId);
      headers.set(SPAN_ID_HEADER, ctx.spanId);
      if (ctx.parentSpanId) {
        headers.set(PARENT_SPAN_ID_HEADER, ctx.parentSpanId);
      }
      headers.set(TRACE_PARENT_HEADER, `00-${ctx.traceId}-${ctx.spanId}-01`);
    } else if (typeof headers === 'object' && headers !== null) {
      const record = headers as Record<string, string>;
      record[TRACE_ID_HEADER] = ctx.traceId;
      record[SPAN_ID_HEADER] = ctx.spanId;
      if (ctx.parentSpanId) {
        record[PARENT_SPAN_ID_HEADER] = ctx.parentSpanId;
      }
      record[TRACE_PARENT_HEADER] = `00-${ctx.traceId}-${ctx.spanId}-01`;
    }
  }

  /**
   * Clears all context state.
   */
  clear(): void {
    this.currentContext = undefined;
    this.contextStack.length = 0;
  }
}

export const defaultContextManager = new BrowserContextManager();
