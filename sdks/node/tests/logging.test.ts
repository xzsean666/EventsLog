import { describe, it, expect, vi } from 'vitest';
import { installConsoleHook } from '../src/logging/console.js';
import { runWithContext, createRootContext } from '../src/tracing/context.js';
import type { Event } from '../src/protocol/types.js';
import { DEFAULT_CONFIG } from '../src/config/types.js';

describe('Zero-Code Console Interception', () => {
  it('should capture console.log inside active trace context', () => {
    const emittedEvents: Event[] = [];
    installConsoleHook(DEFAULT_CONFIG, (event) => {
      emittedEvents.push(event);
    });

    const rootCtx = createRootContext('trace-console-test-1');

    // Run inside trace context
    runWithContext(rootCtx, () => {
      console.log('Order processed successfully for user:', 'usr_999');
    });

    expect(emittedEvents.length).toBeGreaterThan(0);
    const logEvent = emittedEvents.find(
      (e) => (e.payload.data as any).function?.function_name === 'log'
    );
    expect(logEvent).toBeDefined();
    expect(logEvent?.trace_id).toBe('trace-console-test-1');
    expect((logEvent?.payload.data as any).function?.module).toBe('console');
    expect((logEvent?.payload.data as any).input_payload).toEqual([
      'Order processed successfully for user:',
      'usr_999',
    ]);
  });

  it('should ignore console outputs outside active trace context', () => {
    const emittedEvents: Event[] = [];
    installConsoleHook(DEFAULT_CONFIG, (event) => {
      emittedEvents.push(event);
    });

    const initialLen = emittedEvents.length;
    console.info('Unobserved background job heartbeat');
    expect(emittedEvents.length).toBe(initialLen);
  });
});
