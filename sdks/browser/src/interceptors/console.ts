import { BrowserContextManager } from '../tracing/context';
import { Event } from '../protocol/types';
import { generateEventId } from '../tracing/context';

export type ConsoleEmitCallback = (event: Event) => void;

export class ConsoleInterceptor {
  private isInstalled = false;
  private originalMethods: Partial<Record<'log' | 'info' | 'warn' | 'error', typeof console.log>> = {};
  private readonly contextManager: BrowserContextManager;
  private readonly emitCallback: ConsoleEmitCallback;
  private readonly serviceName: string;
  private readonly environment: string;

  constructor(
    contextManager: BrowserContextManager,
    emitCallback: ConsoleEmitCallback,
    options: {
      serviceName: string;
      environment: string;
    }
  ) {
    this.contextManager = contextManager;
    this.emitCallback = emitCallback;
    this.serviceName = options.serviceName;
    this.environment = options.environment;
  }

  install(): void {
    if (this.isInstalled || typeof console === 'undefined') {
      return;
    }

    const methods: ('log' | 'info' | 'warn' | 'error')[] = ['log', 'info', 'warn', 'error'];
    const self = this;

    for (const method of methods) {
      const original = console[method];
      if (typeof original === 'function') {
        this.originalMethods[method] = original.bind(console);

        console[method] = function interceptedConsole(...args: unknown[]): void {
          try {
            const currentSpan = self.contextManager.getCurrentSpan();
            if (currentSpan) {
              const childSpan = self.contextManager.createChildSpan();
              const event: Event = {
                event_id: generateEventId(),
                trace_id: currentSpan.traceId,
                span_id: childSpan.spanId,
                parent_span_id: currentSpan.spanId,
                timestamp: new Date().toISOString(),
                service_name: self.serviceName,
                environment: self.environment,
                event_type: 'function_execution',
                payload: {
                  type: 'function_execution',
                  data: {
                    function: {
                      module: 'browser.console',
                      class_name: 'Console',
                      function_name: method,
                    },
                    duration_nanos: 0,
                    status: method === 'error' ? 'error' : 'success',
                    input_payload: args.map((a) => (typeof a === 'object' ? String(a) : a)),
                    attributes: {
                      'log.level': method,
                    },
                  },
                },
              };
              self.emitCallback(event);
            }
          } catch {
            // Failsafe
          }

          original.apply(console, args);
        };
      }
    }

    this.isInstalled = true;
  }

  uninstall(): void {
    if (!this.isInstalled || typeof console === 'undefined') {
      return;
    }

    for (const [method, original] of Object.entries(this.originalMethods)) {
      if (original) {
        (console as unknown as Record<string, unknown>)[method] = original;
      }
    }
    this.originalMethods = {};
    this.isInstalled = false;
  }
}
