import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserBatchBuffer } from '../src/transport/buffer';
import { Event } from '../src/protocol/types';

describe('Browser Batch Buffer & Dual Transport', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeMockEvent(id: string): Event {
    return {
      event_id: id,
      trace_id: 'trace-1',
      span_id: 'span-1',
      timestamp: new Date().toISOString(),
      service_name: 'test-service',
      environment: 'test',
      event_type: 'custom',
      payload: { type: 'custom', data: {} },
    };
  }

  it('buffers events and automatically flushes when batchSize is reached', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"ok"}', { status: 202 }));
    globalThis.fetch = fetchMock;

    const buffer = new BrowserBatchBuffer({
      endpoint: 'http://localhost:8001/v1/events',
      apiKey: 'test-api-key',
      batchSize: 3,
      flushIntervalMs: 60000,
      headers: { 'X-Custom-Client': 'unit-test' },
    });

    buffer.enqueue(makeMockEvent('e1'));
    buffer.enqueue(makeMockEvent('e2'));
    expect(buffer.getQueueLength()).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();

    buffer.enqueue(makeMockEvent('e3'));
    // Triggered flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8001/v1/events');
    expect(init.method).toBe('POST');
    expect(init.headers['X-API-Key']).toBe('test-api-key');
    expect(init.headers['X-Custom-Client']).toBe('unit-test');

    const body = JSON.parse(init.body as string);
    expect(body.events).toHaveLength(3);
    expect(body.events[0].event_id).toBe('e1');

    buffer.destroy();
  });

  it('drops oldest events when exceeding maxQueueSize', () => {
    const buffer = new BrowserBatchBuffer({
      endpoint: 'http://localhost:8001/v1/events',
      batchSize: 100,
      maxQueueSize: 3,
      flushIntervalMs: 60000,
    });

    buffer.enqueue(makeMockEvent('e1'));
    buffer.enqueue(makeMockEvent('e2'));
    buffer.enqueue(makeMockEvent('e3'));
    expect(buffer.getQueueLength()).toBe(3);

    buffer.enqueue(makeMockEvent('e4'));
    expect(buffer.getQueueLength()).toBe(3);

    buffer.destroy();
  });
});
