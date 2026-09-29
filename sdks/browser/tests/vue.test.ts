import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { init, getClient } from '../src/index';
import { createEventsLogVue, trackVueRouter, VueApp, VueRouter } from '../src/vue/index';

describe('Vue Framework Integration', () => {
  beforeEach(() => {
    init({
      serviceName: 'vue-app-test',
      environment: 'test',
      endpoint: 'http://localhost:8001/v1/events',
    });
  });

  afterEach(() => {
    getClient()?.destroy();
  });

  it('createEventsLogVue installs errorHandler and captures component errors', () => {
    const client = getClient()!;
    const enqueueSpy = vi.spyOn(client.buffer, 'enqueue');

    const originalHandler = vi.fn();
    const mockApp: VueApp = {
      config: {
        errorHandler: originalHandler,
      },
    };

    const plugin = createEventsLogVue();
    plugin.install(mockApp);

    expect(typeof mockApp.config.errorHandler).toBe('function');

    const testError = new Error('Reactivity error in computed');
    const mockInstance = {
      $options: {
        name: 'UserProfileCard',
      },
    };

    mockApp.config.errorHandler!(testError, mockInstance, 'render hook');

    // Checked that original handler is still invoked
    expect(originalHandler).toHaveBeenCalledWith(testError, mockInstance, 'render hook');

    // Checked that EventsLog recorded the error
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const event = enqueueSpy.mock.calls[0][0];
    expect(event.event_type).toBe('error');
    if (event.payload.type === 'error') {
      expect(event.payload.data.message).toBe('Reactivity error in computed');
    }
  });

  it('trackVueRouter captures SPA navigation spans', () => {
    const client = getClient()!;
    const enqueueSpy = vi.spyOn(client.buffer, 'enqueue');

    let afterEachCallback: ((to: { path: string; name?: string }, from: { path: string; name?: string }) => void) | null = null;

    const mockRouter: VueRouter = {
      beforeEach: vi.fn(),
      afterEach: vi.fn().mockImplementation((fn) => {
        afterEachCallback = fn;
      }),
    };

    trackVueRouter(mockRouter);
    expect(mockRouter.afterEach).toHaveBeenCalledTimes(1);
    expect(afterEachCallback).toBeDefined();

    // Trigger router navigation
    afterEachCallback!({ path: '/orders', name: 'OrdersPage' }, { path: '/home' });

    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const event = enqueueSpy.mock.calls[0][0];
    expect(event.event_type).toBe('function_execution');
    if (event.payload.type === 'function_execution') {
      expect(event.payload.data.function.function_name).toBe('navigate');
      expect(event.payload.data.function.module).toBe('vue.router');
      expect(event.payload.data.attributes?.['route.to']).toBe('/orders');
      expect(event.payload.data.attributes?.['route.from']).toBe('/home');
    }
  });
});
