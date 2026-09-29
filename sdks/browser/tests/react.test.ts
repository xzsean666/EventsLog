import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { init, getClient } from '../src/index';
import { EventsLogErrorBoundary, withTracing } from '../src/react/index';

describe('React Framework Integration', () => {
  beforeEach(() => {
    init({
      serviceName: 'react-app-test',
      environment: 'test',
      endpoint: 'http://localhost:8001/v1/events',
    });
  });

  afterEach(() => {
    getClient()?.destroy();
  });

  it('EventsLogErrorBoundary catches errors and dispatches error event to EventsLog', () => {
    const client = getClient()!;
    const enqueueSpy = vi.spyOn(client.buffer, 'enqueue');
    const onErrorCallback = vi.fn();

    const boundary = new EventsLogErrorBoundary({
      componentName: 'UserProfile',
      children: null,
      onError: onErrorCallback,
    });

    const testError = new Error('Cannot read properties of undefined');
    boundary.componentDidCatch(testError, {
      componentStack: '\n    in UserProfile\n    in App',
    });

    expect(onErrorCallback).toHaveBeenCalledWith(testError, '\n    in UserProfile\n    in App');
    expect(enqueueSpy).toHaveBeenCalledTimes(1);

    const emittedEvent = enqueueSpy.mock.calls[0][0];
    expect(emittedEvent.event_type).toBe('error');
    if (emittedEvent.payload.type === 'error') {
      expect(emittedEvent.payload.data.message).toBe('Cannot read properties of undefined');
    }
  });

  it('withTracing HOC wraps component render inside a traced span', () => {
    const client = getClient()!;
    const enqueueSpy = vi.spyOn(client.buffer, 'enqueue');

    const SimpleComponent: React.FC<{ text: string }> = ({ text }) => {
      return React.createElement('span', null, text);
    };

    const Traced = withTracing(SimpleComponent, 'SimpleComponent');
    expect(Traced.displayName).toBe('WithTracing(SimpleComponent)');

    const element = Traced({ text: 'world' });
    expect(element).toBeDefined();

    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const event = enqueueSpy.mock.calls[0][0];
    expect(event.event_type).toBe('function_execution');
    if (event.payload.type === 'function_execution') {
      expect(event.payload.data.function.function_name).toBe('render');
      expect(event.payload.data.function.module).toBe('react.SimpleComponent');
      expect(event.payload.data.status).toBe('success');
    }
  });
});
