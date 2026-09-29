import React, { Component } from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  init,
  getClient,
  startSpan,
  traceAsync,
  captureError,
} from '@eventslog/browser';
import { EventsLogErrorBoundary } from '@eventslog/browser/react';

export interface ReactSimulationOptions {
  ingestionUrl: string;
  backendUrl: string;
  apiKey: string;
}

// Simulates a crashing React component
class FaultyCartSummary extends Component<{ shouldCrash?: boolean }> {
  override render() {
    if (this.props.shouldCrash) {
      throw new Error('React Component Crash: Calculation overflow in CartSummary');
    }
    return React.createElement('div', { className: 'cart-summary' }, 'Total: $420.00');
  }
}

export async function runReactSimulation(options: ReactSimulationOptions) {
  const browserClient = init({
    endpoint: options.ingestionUrl,
    apiKey: options.apiKey,
    serviceName: 'react-frontend-store',
    environment: 'staging',
    allowedTracingOrigins: [options.backendUrl],
    batchSize: 5,
    flushIntervalMs: 50,
  });

  const capturedEvents: any[] = [];
  let reactTraceId = '';

  // 1. Test React User Action with Fetch Distributed Tracing
  const orderResult = await traceAsync('React.CheckoutWorkflow', async () => {
    const traceCtx = browserClient.getCurrentSpan();
    reactTraceId = traceCtx?.traceId || '';

    const response = await fetch(`${options.backendUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: 'usr_react_shopper_777',
        items: [
          { id: 'item_laptop', name: 'MacBook Pro 16', price: 2499, quantity: 1 },
          { id: 'item_hub', name: 'Thunderbolt 4 Dock', price: 299, quantity: 2 },
        ],
        payment: {
          cardNumber: '4532-1111-2222-3333',
          cvv: '987',
          expiry: '12/28',
          billingZip: '94107',
          authToken: 'react_auth_super_secret_token_abc',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    return await response.json();
  });

  // 2. Test React Error Boundary Telemetry
  let boundaryCaught = false;
  const boundary = new EventsLogErrorBoundary({
    componentName: 'FaultyCartSummary',
    children: null,
    onError: (err, stack) => {
      boundaryCaught = true;
    },
  });

  // Trigger componentDidCatch manually with a mock Error & ErrorInfo
  const simulatedReactError = new Error('React UI Crash: Unable to render product grid');
  boundary.componentDidCatch(simulatedReactError, {
    componentStack: '\n    in FaultyCartSummary\n    in CartPage\n    in App',
  });

  // 3. Test React User custom action
  startSpan('React.ClickDiscountButton', () => {
    // perform local state transition
  });

  // Flush browser telemetry buffer
  await browserClient.flush();

  return {
    reactTraceId,
    orderResult,
    boundaryCaught,
    browserClient,
  };
}
