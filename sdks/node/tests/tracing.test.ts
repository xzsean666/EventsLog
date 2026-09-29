import { describe, it, expect } from 'vitest';
import {
  generateTraceId,
  generateSpanId,
  currentContext,
  runWithContext,
  createRootContext,
  createChildSpan,
  withSpan,
} from '../src/index.js';

describe('Tracing Context & AsyncLocalStorage', () => {
  it('should generate valid hex IDs for trace and span', () => {
    const traceId = generateTraceId();
    const spanId = generateSpanId();

    expect(traceId).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(traceId)).toBe(true);

    expect(spanId).toHaveLength(16);
    expect(/^[0-9a-f]{16}$/.test(spanId)).toBe(true);
  });

  it('should return undefined when no trace context is active', () => {
    expect(currentContext()).toBeUndefined();
  });

  it('should preserve trace context within runWithContext', () => {
    const root = createRootContext('custom-trace-id-12345');

    runWithContext(root, () => {
      const current = currentContext();
      expect(current).toBeDefined();
      expect(current?.traceId).toBe('custom-trace-id-12345');
      expect(current?.spanId).toBe(root.spanId);
      expect(current?.parentSpanId).toBeUndefined();
    });

    // Exits cleanly back to undefined
    expect(currentContext()).toBeUndefined();
  });

  it('should propagate context across async/await and promises', async () => {
    const root = createRootContext();

    await runWithContext(root, async () => {
      expect(currentContext()?.traceId).toBe(root.traceId);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(currentContext()?.traceId).toBe(root.traceId);

      const result = await Promise.resolve('data');
      expect(result).toBe('data');
      expect(currentContext()?.traceId).toBe(root.traceId);
    });

    expect(currentContext()).toBeUndefined();
  });

  it('should accurately establish parent-child span hierarchy across nested functions', async () => {
    const root = createRootContext();

    await runWithContext(root, async () => {
      const rootSpan = currentContext()!;
      expect(rootSpan.parentSpanId).toBeUndefined();

      // First nested level
      const child1 = createChildSpan();
      expect(child1.traceId).toBe(rootSpan.traceId);
      expect(child1.parentSpanId).toBe(rootSpan.spanId);

      await runWithContext(child1, async () => {
        const current1 = currentContext()!;
        expect(current1.spanId).toBe(child1.spanId);
        expect(current1.parentSpanId).toBe(rootSpan.spanId);

        // Second nested level
        const child2 = createChildSpan();
        expect(child2.traceId).toBe(rootSpan.traceId);
        expect(child2.parentSpanId).toBe(child1.spanId);

        await runWithContext(child2, async () => {
          const current2 = currentContext()!;
          expect(current2.spanId).toBe(child2.spanId);
          expect(current2.parentSpanId).toBe(child1.spanId);
        });

        // After child2 finishes, child1 context is restored
        expect(currentContext()?.spanId).toBe(child1.spanId);
      });

      // After child1 finishes, root context is restored
      expect(currentContext()?.spanId).toBe(rootSpan.spanId);
    });
  });

  it('should maintain strict isolation between concurrent asynchronous operations', async () => {
    const trace1 = createRootContext('trace-11111111111111111111111111111111');
    const trace2 = createRootContext('trace-22222222222222222222222222222222');

    const task1 = runWithContext(trace1, async () => {
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(currentContext()?.traceId).toBe('trace-11111111111111111111111111111111');
      }
    });

    const task2 = runWithContext(trace2, async () => {
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(currentContext()?.traceId).toBe('trace-22222222222222222222222222222222');
      }
    });

    await Promise.all([task1, task2]);
  });

  it('should wrap functions with new span using withSpan helper', async () => {
    const root = createRootContext();

    const wrappedFn = withSpan(async (x: number, y: number) => {
      const ctx = currentContext();
      return { sum: x + y, parentSpanId: ctx?.parentSpanId };
    }, root);

    const res = await wrappedFn(10, 20);
    expect(res.sum).toBe(30);
    expect(res.parentSpanId).toBe(root.spanId);
  });
});
