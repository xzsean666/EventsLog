import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateTraceId,
  generateSpanId,
  generateEventId,
  BrowserContextManager,
  TRACE_ID_HEADER,
  SPAN_ID_HEADER,
  TRACE_PARENT_HEADER,
} from '../src/tracing/context';

describe('Browser Tracing Context & ID Generator', () => {
  let contextManager: BrowserContextManager;

  beforeEach(() => {
    contextManager = new BrowserContextManager();
  });

  it('generates valid 128-bit hex trace ID (32 characters)', () => {
    const traceId = generateTraceId();
    expect(traceId).toHaveLength(32);
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates valid 64-bit hex span ID (16 characters)', () => {
    const spanId = generateSpanId();
    expect(spanId).toHaveLength(16);
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('generates valid UUID v4 for event ID', () => {
    const eventId = generateEventId();
    expect(eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('maintains active span during synchronous execution and restores on exit', () => {
    expect(contextManager.getCurrentSpan()).toBeUndefined();

    const spanContext = {
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
    };

    const result = contextManager.runInContext(spanContext, () => {
      expect(contextManager.getCurrentSpan()).toEqual(spanContext);
      return 42;
    });

    expect(result).toBe(42);
    expect(contextManager.getCurrentSpan()).toBeUndefined();
  });

  it('maintains active span across Promise resolution and restores on finally', async () => {
    const spanContext = {
      traceId: 'trace-12345678901234567890123456',
      spanId: 'span-12345678901',
    };

    const promise = contextManager.runInContext(spanContext, async () => {
      expect(contextManager.getCurrentSpan()).toEqual(spanContext);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(contextManager.getCurrentSpan()).toEqual(spanContext);
      return 'async-done';
    });

    const val = await promise;
    expect(val).toBe('async-done');
    expect(contextManager.getCurrentSpan()).toBeUndefined();
  });

  it('creates nested child spans correctly', () => {
    const root = contextManager.createChildSpan();
    expect(root.parentSpanId).toBeUndefined();

    contextManager.runInContext(root, () => {
      const child = contextManager.createChildSpan();
      expect(child.traceId).toBe(root.traceId);
      expect(child.parentSpanId).toBe(root.spanId);
      expect(child.spanId).not.toBe(root.spanId);
    });
  });

  it('injects trace headers into plain object and Headers instance', () => {
    const spanContext = {
      traceId: '11112222333344445555666677778888',
      spanId: 'aaaabbbbccccdddd',
      parentSpanId: '0000111122223333',
    };

    // Object
    const objHeaders: Record<string, string> = {};
    contextManager.injectTraceHeaders(objHeaders, spanContext);
    expect(objHeaders[TRACE_ID_HEADER]).toBe(spanContext.traceId);
    expect(objHeaders[SPAN_ID_HEADER]).toBe(spanContext.spanId);
    expect(objHeaders[TRACE_PARENT_HEADER]).toBe(`00-${spanContext.traceId}-${spanContext.spanId}-01`);

    // Headers
    const headers = new Headers();
    contextManager.injectTraceHeaders(headers, spanContext);
    expect(headers.get(TRACE_ID_HEADER)).toBe(spanContext.traceId);
    expect(headers.get(SPAN_ID_HEADER)).toBe(spanContext.spanId);
  });
});
