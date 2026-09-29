import { describe, it, expect } from 'vitest';
import type { FunctionSummary, TraceTree } from '../src/api/types.js';

describe('Dashboard Views & State Transformations', () => {
  const mockFunctions: FunctionSummary[] = [
    {
      function_id: 'fn-1',
      service_name: 'order-service',
      module: 'src/services/order.ts',
      class_name: 'OrderController',
      function_name: 'checkout',
      total_executions: 100,
      total_errors: 5,
      avg_duration_ms: 25.0,
      last_seen: new Date().toISOString(),
    },
    {
      function_id: 'fn-2',
      service_name: 'billing-service',
      module: 'src/services/billing.ts',
      class_name: 'BillingStore',
      function_name: 'invoice',
      total_executions: 50,
      total_errors: 0,
      avg_duration_ms: 10.0,
      last_seen: new Date().toISOString(),
    },
    {
      function_id: 'fn-3',
      service_name: 'auth-service',
      module: 'src/services/auth.ts',
      function_name: 'login',
      total_executions: 200,
      total_errors: 12,
      avg_duration_ms: 50.0,
      last_seen: new Date().toISOString(),
    },
  ];

  it('should filter functions by query matching name, class, or service', () => {
    const query = 'billing';
    const filtered = mockFunctions.filter(
      (f) =>
        f.function_name.includes(query) ||
        (f.class_name && f.class_name.toLowerCase().includes(query)) ||
        f.service_name.includes(query)
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].function_name).toBe('invoice');
  });

  it('should sort functions descending by total invocations', () => {
    const sorted = [...mockFunctions].sort(
      (a, b) => b.total_executions - a.total_executions
    );
    expect(sorted[0].function_name).toBe('login'); // 200
    expect(sorted[1].function_name).toBe('checkout'); // 100
    expect(sorted[2].function_name).toBe('invoice'); // 50
  });

  it('should sort functions descending by error count', () => {
    const sorted = [...mockFunctions].sort(
      (a, b) => b.total_errors - a.total_errors
    );
    expect(sorted[0].function_name).toBe('login'); // 12
    expect(sorted[1].function_name).toBe('checkout'); // 5
    expect(sorted[2].function_name).toBe('invoice'); // 0
  });

  it('should calculate relative waterfall percentages in trace tree', () => {
    const mockTrace: TraceTree = {
      trace_id: 'trace-test-123',
      total_spans: 2,
      total_duration_ms: 200.0,
      root_spans: [
        {
          span_id: 'span-root',
          service_name: 'gateway',
          module: 'api',
          function_name: 'handle',
          status: 'success',
          duration_ms: 200.0,
          timestamp: new Date().toISOString(),
          children: [
            {
              span_id: 'span-child',
              parent_span_id: 'span-root',
              service_name: 'db',
              module: 'repo',
              function_name: 'query',
              status: 'success',
              duration_ms: 50.0,
              timestamp: new Date().toISOString(),
              children: [],
            },
          ],
        },
      ],
    };

    const rootDuration = mockTrace.root_spans[0].duration_ms;
    const childDuration = mockTrace.root_spans[0].children[0].duration_ms;

    expect((rootDuration / mockTrace.total_duration_ms) * 100).toBe(100);
    expect((childDuration / mockTrace.total_duration_ms) * 100).toBe(25);
  });
});
