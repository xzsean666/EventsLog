import { describe, it, expect, vi } from 'vitest';
import {
  wrapFunction,
  patchClass,
  patchModule,
  type Event,
  type EventsLogConfig,
  DEFAULT_CONFIG,
} from '../src/index.js';

describe('Instrumentation Engine & Method Wrapper', () => {
  it('should wrap synchronous function and capture execution telemetry', () => {
    const events: Event[] = [];
    const sink = (e: Event) => events.push(e);

    const calculateTax = (amount: number, rate: number) => amount * rate;
    const wrapped = wrapFunction(
      calculateTax,
      { module: 'billing', function_name: 'calculateTax' },
      { sink, serviceName: 'billing-svc' }
    );

    const res = wrapped(100, 0.15);
    expect(res).toBe(15);
    expect(events).toHaveLength(1);

    const event = events[0];
    expect(event.service_name).toBe('billing-svc');
    expect(event.payload.type).toBe('function_execution');
    if (event.payload.type === 'function_execution') {
      expect(event.payload.data.status).toBe('success');
      expect(event.payload.data.function.function_name).toBe('calculateTax');
      expect(event.payload.data.input_payload).toEqual([100, 0.15]);
      expect(event.payload.data.output_payload).toBe(15);
      expect(event.payload.data.duration_nanos).toBeGreaterThan(0);
    }
  });

  it('should capture error and re-throw without alteration in sync function', () => {
    const events: Event[] = [];
    const sink = (e: Event) => events.push(e);

    const failFn = () => {
      throw new RangeError('Index out of range');
    };

    const wrapped = wrapFunction(
      failFn,
      { module: 'core', function_name: 'failFn' },
      { sink }
    );

    expect(() => wrapped()).toThrow(RangeError);
    expect(events).toHaveLength(1);

    const event = events[0];
    if (event.payload.type === 'function_execution') {
      expect(event.payload.data.status).toBe('error');
      expect(event.payload.data.error?.type_name).toBe('RangeError');
      expect(event.payload.data.error?.message).toBe('Index out of range');
    }
  });

  it('should wrap async function and capture resolved promise value', async () => {
    const events: Event[] = [];
    const sink = (e: Event) => events.push(e);

    const fetchData = async (id: string) => {
      await new Promise((r) => setTimeout(r, 10));
      return { id, name: 'Alice' };
    };

    const wrapped = wrapFunction(
      fetchData,
      { module: 'users', function_name: 'fetchData' },
      { sink }
    );

    const result = await wrapped('usr_99');
    expect(result).toEqual({ id: 'usr_99', name: 'Alice' });
    expect(events).toHaveLength(1);

    const event = events[0];
    if (event.payload.type === 'function_execution') {
      expect(event.payload.data.status).toBe('success');
      expect(event.payload.data.input_payload).toBe('usr_99');
      expect(event.payload.data.output_payload).toEqual({ id: 'usr_99', name: 'Alice' });
      expect(event.payload.data.duration_nanos).toBeGreaterThan(1_000_000); // > 1ms
    }
  });

  it('should capture rejected promise error and re-reject cleanly in async function', async () => {
    const events: Event[] = [];
    const sink = (e: Event) => events.push(e);

    const asyncFail = async () => {
      await new Promise((r) => setTimeout(r, 5));
      throw new Error('Async network timeout');
    };

    const wrapped = wrapFunction(
      asyncFail,
      { module: 'api', function_name: 'asyncFail' },
      { sink }
    );

    await expect(wrapped()).rejects.toThrow('Async network timeout');
    expect(events).toHaveLength(1);

    const event = events[0];
    if (event.payload.type === 'function_execution') {
      expect(event.payload.data.status).toBe('error');
      expect(event.payload.data.error?.message).toBe('Async network timeout');
    }
  });

  it('should establish trace hierarchy across nested wrapped functions', async () => {
    const events: Event[] = [];
    const sink = (e: Event) => events.push(e);

    const innerMethod = wrapFunction(
      async (n: number) => n * 2,
      { module: 'math', function_name: 'double' },
      { sink }
    );

    const outerMethod = wrapFunction(
      async (n: number) => {
        const d = await innerMethod(n);
        return d + 1;
      },
      { module: 'math', function_name: 'doubleAndAddOne' },
      { sink }
    );

    const res = await outerMethod(5);
    expect(res).toBe(11);
    expect(events).toHaveLength(2);

    // Inner completes first, outer completes second
    const innerEvent = events[0];
    const outerEvent = events[1];

    expect(innerEvent.trace_id).toBe(outerEvent.trace_id);
    expect(innerEvent.parent_span_id).toBe(outerEvent.span_id);
    expect(outerEvent.parent_span_id).toBeUndefined();
  });

  it('should patch class methods matching configuration and prevent double-wrapping', () => {
    const events: Event[] = [];
    const sink = (e: Event) => events.push(e);

    class OrderService {
      checkout(orderId: string) {
        return `checked-out-${orderId}`;
      }
      ignoreMe() {
        return 'ignored';
      }
    }

    const testConfig: EventsLogConfig = {
      ...DEFAULT_CONFIG,
      instrumentation: {
        ...DEFAULT_CONFIG.instrumentation,
        include: ['OrderService.checkout'],
        exclude: ['OrderService.ignoreMe'],
      },
    };

    patchClass(OrderService, 'OrderService', 'services/order', testConfig, sink);

    const svc = new OrderService();
    const res = svc.checkout('123');
    expect(res).toBe('checked-out-123');
    expect(events).toHaveLength(1);

    // Ignored method should not emit events
    const ignored = svc.ignoreMe();
    expect(ignored).toBe('ignored');
    expect(events).toHaveLength(1);

    // Calling patchClass a second time does not double wrap
    patchClass(OrderService, 'OrderService', 'services/order', testConfig, sink);
    svc.checkout('456');
    expect(events).toHaveLength(2);
  });

  it('should patch module exports object', () => {
    const events: Event[] = [];
    const sink = (e: Event) => events.push(e);

    const myModule = {
      greet: (name: string) => `Hello, ${name}`,
      skip: () => 'skipped',
    };

    const testConfig: EventsLogConfig = {
      ...DEFAULT_CONFIG,
      instrumentation: {
        ...DEFAULT_CONFIG.instrumentation,
        include: ['my_module:greet'],
      },
    };

    patchModule(myModule, 'my_module', testConfig, sink);

    expect(myModule.greet('Bob')).toBe('Hello, Bob');
    expect(events).toHaveLength(1);

    expect(myModule.skip()).toBe('skipped');
    expect(events).toHaveLength(1);
  });
});
