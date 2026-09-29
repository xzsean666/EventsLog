import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  createExecutionError,
  type Event,
  type BatchEventPayload,
  type FunctionExecution,
} from '../src/index.js';

describe('Protocol Types and Helpers', () => {
  it('should export correct protocol version', () => {
    expect(PROTOCOL_VERSION).toBe('1.0.0');
  });

  it('should create ExecutionError from Error instance', () => {
    const error = new TypeError('Invalid argument passed');
    const execError = createExecutionError(error);

    expect(execError.type_name).toBe('TypeError');
    expect(execError.message).toBe('Invalid argument passed');
    expect(execError.stack_trace).toBeDefined();
    expect(execError.stack_trace).toContain('TypeError: Invalid argument passed');
  });

  it('should create ExecutionError from non-Error primitive/object', () => {
    const execError = createExecutionError('Something failed abruptly');
    expect(execError.type_name).toBe('UnknownError');
    expect(execError.message).toBe('Something failed abruptly');
    expect(execError.stack_trace).toBeUndefined();
  });

  it('should serialize and match canonical Event schema', () => {
    const execution: FunctionExecution = {
      function: {
        module: 'services/order',
        class_name: 'OrderProcessor',
        function_name: 'processCheckout',
        file_path: 'src/services/order.ts',
        line_number: 45,
      },
      input_payload: { order_id: 'ord_123', amount: 99.5 },
      output_payload: { status: 'approved' },
      duration_nanos: 12_500_000,
      status: 'success',
      attributes: { 'customer.tier': 'gold' },
    };

    const event: Event = {
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      trace_id: 'trace-abcdef1234567890',
      span_id: 'span-001',
      parent_span_id: 'span-parent',
      timestamp: new Date().toISOString(),
      service_name: 'checkout-service',
      environment: 'production',
      event_type: 'function_execution',
      payload: {
        type: 'function_execution',
        data: execution,
      },
    };

    const serialized = JSON.stringify(event);
    const parsed = JSON.parse(serialized);

    expect(parsed.event_id).toBe(event.event_id);
    expect(parsed.trace_id).toBe('trace-abcdef1234567890');
    expect(parsed.span_id).toBe('span-001');
    expect(parsed.parent_span_id).toBe('span-parent');
    expect(parsed.service_name).toBe('checkout-service');
    expect(parsed.environment).toBe('production');
    expect(parsed.event_type).toBe('function_execution');

    expect(parsed.payload.type).toBe('function_execution');
    expect(parsed.payload.data.function.class_name).toBe('OrderProcessor');
    expect(parsed.payload.data.function.function_name).toBe('processCheckout');
    expect(parsed.payload.data.duration_nanos).toBe(12500000);
    expect(parsed.payload.data.status).toBe('success');
    expect(parsed.payload.data.attributes['customer.tier']).toBe('gold');
  });

  it('should structure BatchEventPayload accurately', () => {
    const batch: BatchEventPayload = {
      events: [
        {
          event_id: '11111111-1111-1111-1111-111111111111',
          trace_id: 'trace-1',
          span_id: 'span-1',
          timestamp: new Date().toISOString(),
          service_name: 'test-service',
          environment: 'local',
          event_type: 'system',
          payload: {
            type: 'system',
            data: { message: 'daemon started' },
          },
        },
      ],
    };

    const jsonStr = JSON.stringify(batch);
    const parsed: BatchEventPayload = JSON.parse(jsonStr);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].event_type).toBe('system');
  });
});
