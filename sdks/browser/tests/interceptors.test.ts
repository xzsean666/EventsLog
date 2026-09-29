import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserContextManager } from '../src/tracing/context';
import { FetchInterceptor } from '../src/interceptors/fetch';
import { ConsoleInterceptor } from '../src/interceptors/console';
import { Event } from '../src/protocol/types';

describe('Browser Interceptors', () => {
  let contextManager: BrowserContextManager;

  beforeEach(() => {
    contextManager = new BrowserContextManager();
  });

  describe('FetchInterceptor', () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('intercepts fetch, injects trace headers, and emits telemetry event', async () => {
      const capturedEvents: Event[] = [];
      const mockResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        statusText: 'OK',
      });

      const mockFetch = vi.fn().mockResolvedValue(mockResponse);
      globalThis.fetch = mockFetch;

      const interceptor = new FetchInterceptor(
        contextManager,
        (event) => capturedEvents.push(event),
        {
          ingestionEndpoint: 'http://localhost:8001/v1/events',
          serviceName: 'browser-test-app',
          environment: 'test',
        }
      );

      interceptor.install();

      const spanContext = {
        traceId: '11112222333344445555666677778888',
        spanId: '1234567890123456',
      };

      await contextManager.runInContext(spanContext, async () => {
        const res = await globalThis.fetch('https://api.example.com/users', {
          method: 'GET',
        });
        expect(res.status).toBe(200);
      });

      expect(capturedEvents).toHaveLength(1);
      const event = capturedEvents[0];
      expect(event.trace_id).toBe(spanContext.traceId);
      expect(event.parent_span_id).toBe(spanContext.spanId);
      expect(event.event_type).toBe('function_execution');

      if (event.payload.type === 'function_execution') {
        expect(event.payload.data.function.function_name).toBe('GET /users');
        expect(event.payload.data.status).toBe('success');
        expect(event.payload.data.attributes?.['http.status_code']).toBe(200);
      }

      // Check that headers were injected in underlying call
      const fetchCalls = mockFetch.mock.calls;
      expect(fetchCalls.length).toBe(1);
      const callInit = fetchCalls[0][1] as RequestInit;
      const headers = callInit.headers as Headers;
      expect(headers.get('x-trace-id')).toBe(spanContext.traceId);

      interceptor.uninstall();
    });

    it('does not intercept calls to the ingestion endpoint itself to prevent loops', async () => {
      const capturedEvents: Event[] = [];
      globalThis.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));

      const interceptor = new FetchInterceptor(
        contextManager,
        (event) => capturedEvents.push(event),
        {
          ingestionEndpoint: 'http://localhost:8001/v1/events',
          serviceName: 'browser-test-app',
          environment: 'test',
        }
      );

      interceptor.install();

      await globalThis.fetch('http://localhost:8001/v1/events', {
        method: 'POST',
        body: '{}',
      });

      expect(capturedEvents).toHaveLength(0);
      interceptor.uninstall();
    });

    it('injects trace headers only to allowedTracingOrigins to avoid 3rd-party CORS issues', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      globalThis.fetch = mockFetch;

      const interceptor = new FetchInterceptor(
        contextManager,
        () => {},
        {
          ingestionEndpoint: 'http://localhost:8001/v1/events',
          serviceName: 'browser-test-app',
          environment: 'test',
          allowedTracingOrigins: ['https://api.internal.com'],
        }
      );

      interceptor.install();

      const spanContext = {
        traceId: 'trace-origin-check-123456789012',
        spanId: 'span-origin-1234',
      };

      await contextManager.runInContext(spanContext, async () => {
        // 1. Allowed internal origin -> should have trace headers
        await globalThis.fetch('https://api.internal.com/data');
        const call1Headers = mockFetch.mock.calls[0][1]?.headers as Headers | undefined;
        expect(call1Headers?.get('x-trace-id')).toBe(spanContext.traceId);

        // 2. Third-party origin (e.g. Stripe/Google) -> should NOT have trace headers injected
        await globalThis.fetch('https://api.stripe.com/v1/tokens');
        const call2Init = mockFetch.mock.calls[1][1];
        const call2Headers = call2Init?.headers;
        expect(call2Headers).toBeUndefined();
      });

      interceptor.uninstall();
    });
  });

  describe('ConsoleInterceptor', () => {
    it('captures console.error during active span', () => {
      const capturedEvents: Event[] = [];
      const interceptor = new ConsoleInterceptor(
        contextManager,
        (event) => capturedEvents.push(event),
        {
          serviceName: 'browser-test-app',
          environment: 'test',
        }
      );

      interceptor.install();

      const spanContext = {
        traceId: 'trace-11112222333344445555666677778888',
        spanId: 'span-111122223333',
      };

      contextManager.runInContext(spanContext, () => {
        console.error('Test error message', { code: 500 });
      });

      expect(capturedEvents).toHaveLength(1);
      const event = capturedEvents[0];
      expect(event.trace_id).toBe(spanContext.traceId);
      expect(event.parent_span_id).toBe(spanContext.spanId);
      if (event.payload.type === 'function_execution') {
        expect(event.payload.data.function.function_name).toBe('error');
        expect(event.payload.data.status).toBe('error');
      }

      interceptor.uninstall();
    });
  });
});
