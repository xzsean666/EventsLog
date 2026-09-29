import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EventBatcher,
  Sampler,
  type Event,
  type BatcherTransport,
} from '../src/index.js';

function createMockEvent(id: number): Event {
  return {
    event_id: `00000000-0000-0000-0000-${id.toString().padStart(12, '0')}`,
    trace_id: 'trace-1234567890abcdef1234567890abcdef',
    span_id: 'span-001',
    timestamp: new Date().toISOString(),
    service_name: 'test-service',
    environment: 'test',
    event_type: 'function_execution',
    payload: {
      type: 'function_execution',
      data: {
        function: { module: 'test', function_name: `fn_${id}` },
        duration_nanos: 1000,
        status: 'success',
      },
    },
  };
}

describe('Sampler', () => {
  it('should sample all events when rate is 1.0', () => {
    const sampler = new Sampler(1.0);
    expect(sampler.shouldSample()).toBe(true);
    expect(sampler.shouldSample('trace-1234567890abcdef1234567890abcdef')).toBe(true);
  });

  it('should drop all events when rate is 0.0', () => {
    const sampler = new Sampler(0.0);
    expect(sampler.shouldSample()).toBe(false);
    expect(sampler.shouldSample('trace-1234567890abcdef1234567890abcdef')).toBe(false);
  });

  it('should deterministically sample based on traceId', () => {
    const sampler = new Sampler(0.5);
    const traceIdLow = '00000000000000000000000000001000'; // 0x1000 / 0x10000 = ~0.06 < 0.5
    const traceIdHigh = '0000000000000000000000000000f000'; // 0xf000 / 0x10000 = ~0.93 > 0.5

    expect(sampler.shouldSample(traceIdLow)).toBe(true);
    expect(sampler.shouldSample(traceIdHigh)).toBe(false);
  });
});

describe('EventBatcher Auto-Batching Engine', () => {
  let dispatchedBatches: Event[][] = [];
  let mockTransport: BatcherTransport;

  beforeEach(() => {
    dispatchedBatches = [];
    mockTransport = {
      sendBatch: async (events: Event[]) => {
        dispatchedBatches.push(events);
        return true;
      },
    };
  });

  it('should trigger an immediate flush when maxBatchSize is reached (count-triggered)', async () => {
    const batcher = new EventBatcher({
      maxBatchSize: 5,
      flushIntervalMs: 10000, // Long timer to verify count triggers first
      maxQueueSize: 100,
      transport: mockTransport,
    });

    for (let i = 1; i <= 4; i++) {
      batcher.push(createMockEvent(i));
    }
    expect(dispatchedBatches).toHaveLength(0);
    expect(batcher.getBufferSize()).toBe(4);

    // 5th event reaches maxBatchSize=5
    batcher.push(createMockEvent(5));

    // Yield tick for async flush execution
    await new Promise((r) => setTimeout(r, 10));

    expect(dispatchedBatches).toHaveLength(1);
    expect(dispatchedBatches[0]).toHaveLength(5);
    expect(batcher.getBufferSize()).toBe(0);

    await batcher.shutdown();
  });

  it('should flush after flushIntervalMs expires even if batch size not reached (time-triggered)', async () => {
    const batcher = new EventBatcher({
      maxBatchSize: 100, // Large threshold
      flushIntervalMs: 40, // 40ms interval
      maxQueueSize: 1000,
      transport: mockTransport,
    });

    batcher.push(createMockEvent(1));
    batcher.push(createMockEvent(2));
    expect(dispatchedBatches).toHaveLength(0);

    // Wait 60ms for timer to trigger
    await new Promise((r) => setTimeout(r, 60));

    expect(dispatchedBatches).toHaveLength(1);
    expect(dispatchedBatches[0]).toHaveLength(2);
    expect(batcher.getBufferSize()).toBe(0);

    await batcher.shutdown();
  });

  it('should safely drop surplus events when maxQueueSize is exceeded', async () => {
    // Transport that pauses or does not auto-drain
    const slowTransport: BatcherTransport = {
      sendBatch: async () => true,
    };

    const batcher = new EventBatcher({
      maxBatchSize: 100,
      flushIntervalMs: 50000,
      maxQueueSize: 5, // Strict queue cap
      transport: slowTransport,
    });

    for (let i = 1; i <= 5; i++) {
      const accepted = batcher.push(createMockEvent(i));
      expect(accepted).toBe(true);
    }
    expect(batcher.getBufferSize()).toBe(5);

    // 6th through 8th events must be dropped
    const accepted6 = batcher.push(createMockEvent(6));
    const accepted7 = batcher.push(createMockEvent(7));
    const accepted8 = batcher.push(createMockEvent(8));

    expect(accepted6).toBe(false);
    expect(accepted7).toBe(false);
    expect(accepted8).toBe(false);

    expect(batcher.getDroppedCount()).toBe(3);
    expect(batcher.getBufferSize()).toBe(5);

    await batcher.shutdown();
  });

  it('should cleanly flush remaining items on shutdown', async () => {
    const batcher = new EventBatcher({
      maxBatchSize: 100,
      flushIntervalMs: 10000,
      maxQueueSize: 500,
      transport: mockTransport,
    });

    batcher.push(createMockEvent(1));
    batcher.push(createMockEvent(2));

    await batcher.shutdown();

    expect(dispatchedBatches).toHaveLength(1);
    expect(dispatchedBatches[0]).toHaveLength(2);
    expect(batcher.getBufferSize()).toBe(0);
  });
});
