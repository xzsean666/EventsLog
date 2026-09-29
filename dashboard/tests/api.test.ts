import { describe, it, expect, vi } from 'vitest';
import { EventsLogApiClient, ApiClientError } from '../src/api/client.js';

describe('EventsLogApiClient', () => {
  it('should fetch stats with fallback data when offline', async () => {
    const client = new EventsLogApiClient({ enableFallback: true });
    const stats = await client.fetchStats();
    expect(stats.total_executions).toBeGreaterThan(0);
    expect(stats.p50_duration_ms).toBeDefined();
    expect(stats.error_rate).toBeLessThan(1);
  });

  it('should fetch function summaries with fallback data', async () => {
    const client = new EventsLogApiClient({ enableFallback: true });
    const functions = await client.fetchFunctions();
    expect(functions).toHaveLength(3);
    expect(functions[0].function_name).toBe('checkout');
    expect(functions[0].service_name).toBe('order-service');
  });

  it('should fetch trace tree hierarchy with fallback data', async () => {
    const client = new EventsLogApiClient({ enableFallback: true });
    const trace = await client.fetchTrace('0af7651916cd43dd8448eb211c80319c');
    expect(trace.trace_id).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(trace.root_spans).toHaveLength(1);
    expect(trace.root_spans[0].children).toHaveLength(2);
  });

  it('should throw ApiClientError when fallback is disabled and endpoint fails', async () => {
    const client = new EventsLogApiClient({
      baseUrl: 'http://127.0.0.1:9999',
      enableFallback: false,
    });

    await expect(client.fetchStats()).rejects.toThrow(ApiClientError);
  });

  it('should parse HTTP response correctly when server responds ok', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        stats: {
          total_executions: 500,
          total_errors: 5,
          error_rate: 0.01,
          p50_duration_ms: 10,
          p95_duration_ms: 25,
          p99_duration_ms: 50,
        },
      }),
    });

    try {
      const client = new EventsLogApiClient({
        baseUrl: 'http://mock-server',
        enableFallback: false,
      });
      const stats = await client.fetchStats();
      expect(stats.total_executions).toBe(500);
      expect(stats.total_errors).toBe(5);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
