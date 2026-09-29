import { createApp, h } from 'vue';
import {
  init,
  getClient,
  startSpan,
  traceAsync,
  captureError,
} from '@eventslog/browser';
import { createEventsLogVue, trackVueRouter, type VueRouter } from '@eventslog/browser/vue';

export interface VueSimulationOptions {
  ingestionUrl: string;
  backendUrl: string;
  apiKey: string;
}

export async function runVueSimulation(options: VueSimulationOptions) {
  const browserClient = init({
    endpoint: options.ingestionUrl,
    apiKey: options.apiKey,
    serviceName: 'vue-frontend-admin',
    environment: 'staging',
    allowedTracingOrigins: [options.backendUrl],
    batchSize: 5,
    flushIntervalMs: 50,
  });

  // 1. Setup mock Vue Router
  let beforeHooks: Array<(to: any, from: any) => void> = [];
  let afterHooks: Array<(to: any, from: any) => void> = [];

  const mockRouter: VueRouter = {
    beforeEach: (guard) => {
      beforeHooks.push(guard);
    },
    afterEach: (hook) => {
      afterHooks.push(hook);
    },
  };

  // 2. Setup Vue 3 App with EventsLogVue plugin
  const app = createApp({
    render() {
      return h('div', { id: 'app' }, 'Vue Admin Store');
    },
  });

  const vuePlugin = createEventsLogVue({
    router: mockRouter,
    captureErrors: true,
  });
  app.use(vuePlugin);

  // 3. Simulate Vue Router Navigation Transitions
  const simulateNavigation = async (fromPath: string, toPath: string) => {
    const to = { path: toPath, name: toPath.replace('/', '') };
    const from = { path: fromPath, name: fromPath.replace('/', '') };

    for (const guard of beforeHooks) {
      guard(to, from);
    }
    // Simulate navigation render latency
    await new Promise((resolve) => setTimeout(resolve, 30));
    for (const hook of afterHooks) {
      hook(to, from);
    }
  };

  await simulateNavigation('/dashboard', '/inventory/manage');
  await simulateNavigation('/inventory/manage', '/checkout/express');

  // 4. Simulate Vue Global Error Capture
  if (app.config.errorHandler) {
    const vueComponentInstance = {
      $options: { name: 'InventoryManagementTable' },
    };
    app.config.errorHandler(
      new Error('Vue Unhandled Error: Inventory stock reactivity mismatch'),
      vueComponentInstance as any,
      'mounted hook'
    );
  }

  // 5. Test Vue Initiating Cross-Tier Request with Error Response from NestJS
  let vueTraceId = '';
  let nestErrorMessage = '';

  await traceAsync('Vue.SubmitDeclinedOrder', async () => {
    const traceCtx = browserClient.getCurrentSpan();
    vueTraceId = traceCtx?.traceId || '';

    try {
      const response = await fetch(`${options.backendUrl}/api/orders/fail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'usr_vue_admin_999',
          items: [{ id: 'item_server_rack', name: '42U Server Rack', price: 1200, quantity: 1 }],
          payment: {
            cardNumber: '4000-0000-0000-0000', // Declining card trigger
            cvv: '123',
            expiry: '01/29',
            billingZip: '10001',
            authToken: 'vue_admin_secret_token_xyz',
          },
        }),
      });

      const data = await response.json();
      nestErrorMessage = data.message || JSON.stringify(data);
    } catch (err: any) {
      nestErrorMessage = err.message;
    }
  });

  // Flush browser telemetry buffer
  await browserClient.flush();

  return {
    vueTraceId,
    nestErrorMessage,
    browserClient,
  };
}
