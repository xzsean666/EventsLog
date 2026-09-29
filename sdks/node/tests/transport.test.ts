import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpTransport, type Event } from '../src/index.js';

describe('HttpTransport', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockEvent: Event = {
    event_id: '12345678-1234-1234-1234-123456789abc',
    trace_id: 'trace-1234567890abcdef1234567890abcdef',
    span_id: 'span-001',
    timestamp: new Date().toISOString(),
    service_name: 'test-svc',
    environment: 'production',
    event_type: 'function_execution',
    payload: {
      type: 'function_execution',
      data: {
        function: { module: 'svc', function_name: 'test' },
        duration_nanos: 5000,
        status: 'success',
      },
    },
  };

  it('should deliver batch to endpoint with auth headers', async () => {
    let capturedUrl = '';
    let capturedOptions: any = null;

    global.fetch = vi.fn().mockImplementation(async (url, options) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return {
        ok: true,
        status: 202,
        statusText: 'Accepted',
      };
    });

    const transport = new HttpTransport({
      endpoint: 'http://localhost:8080/v1/events',
      apiKey: 'el_live_test_key_12345',
    });

    const success = await transport.sendBatch([mockEvent]);
    expect(success).toBe(true);
    expect(capturedUrl).toBe('http://localhost:8080/v1/events');
    expect(capturedOptions.method).toBe('POST');
    expect(capturedOptions.headers['x-api-key']).toBe('el_live_test_key_12345');
    expect(capturedOptions.headers['Authorization']).toBe('Bearer el_live_test_key_12345');

    const parsedBody = JSON.parse(capturedOptions.body);
    expect(parsedBody.events).toHaveLength(1);
    expect(parsedBody.events[0].trace_id).toBe(mockEvent.trace_id);
  });

  it('should isolate HTTP errors without throwing to application code', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const transport = new HttpTransport({
      endpoint: 'http://localhost:8080/v1/events',
    });

    const success = await transport.sendBatch([mockEvent]);
    expect(success).toBe(false); // Clean failure, no exception thrown
  });

  it('should isolate network failures without throwing to application code', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:8080'));

    const transport = new HttpTransport({
      endpoint: 'http://localhost:8080/v1/events',
    });

    const success = await transport.sendBatch([mockEvent]);
    expect(success).toBe(false); // Clean failure, no exception thrown
  });

  it('should return true immediately when batch is empty without network call', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const transport = new HttpTransport({
      endpoint: 'http://localhost:8080/v1/events',
    });

    const success = await transport.sendBatch([]);
    expect(success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
