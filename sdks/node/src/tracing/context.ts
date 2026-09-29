import { AsyncLocalStorage } from 'node:async_hooks';
import * as crypto from 'node:crypto';

/**
 * Tracing context containing distributed trace and execution span IDs.
 */
export interface TraceContext {
  /**
   * 128-bit distributed trace identifier (32 hex characters).
   */
  traceId: string;
  /**
   * 64-bit function execution span identifier (16 hex characters).
   */
  spanId: string;
  /**
   * Enclosing parent span identifier, if this execution is nested within another.
   */
  parentSpanId?: string;
  /**
   * Optional contextual metadata baggage.
   */
  baggage?: Record<string, string>;
}

const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Generates a standard 128-bit trace ID represented as 32 lowercase hex characters.
 */
export function generateTraceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generates a standard 64-bit span ID represented as 16 lowercase hex characters.
 */
export function generateSpanId(): string {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Returns the currently active TraceContext, or undefined if no span context is active.
 */
export function currentContext(): TraceContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Executes a function within the specified trace context.
 */
export function runWithContext<T>(context: TraceContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Creates a new root TraceContext.
 */
export function createRootContext(customTraceId?: string): TraceContext {
  return {
    traceId: customTraceId || generateTraceId(),
    spanId: generateSpanId(),
    baggage: {},
  };
}

/**
 * Creates a child span context derived from the current or explicitly provided parent context.
 * If no parent context is active or provided, a new root context is initiated.
 */
export function createChildSpan(parentContext?: TraceContext): TraceContext {
  const activeParent = parentContext ?? currentContext();

  if (!activeParent) {
    return createRootContext();
  }

  return {
    traceId: activeParent.traceId,
    spanId: generateSpanId(),
    parentSpanId: activeParent.spanId,
    baggage: activeParent.baggage ? { ...activeParent.baggage } : {},
  };
}

/**
 * Wraps an arbitrary synchronous or asynchronous function to execute within a newly created
 * child span context (or root context if none is active).
 */
export function withSpan<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  parentContext?: TraceContext
): (...args: TArgs) => TReturn {
  return (...args: TArgs): TReturn => {
    const childContext = createChildSpan(parentContext);
    return runWithContext(childContext, () => fn(...args));
  };
}
