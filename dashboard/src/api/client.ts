import type {
  FunctionSummary,
  ExecutionRecord,
  TraceTree,
  TraceNode,
  ServiceStats,
} from './types.js';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  apiKey?: string;
  enableFallback?: boolean;
}

export class EventsLogApiClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly enableFallback: boolean;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.enableFallback = options.enableFallback ?? false;
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this.apiKey) {
        headers['x-api-key'] = this.apiKey;
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const res = await fetch(url, { headers });

      if (!res.ok) {
        throw new ApiClientError(res.status, `HTTP error ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      return json as T;
    } catch (err) {
      if (err instanceof ApiClientError) {
        throw err;
      }
      throw new ApiClientError(0, `Network request failed for ${url}: ${String(err)}`);
    }
  }

  /**
   * Fetches overall system telemetry statistics (throughput, error rate, p50/p95/p99 latency).
   */
  async fetchStats(): Promise<ServiceStats> {
    try {
      const res = await this.request<any>('/v1/stats');
      const s = res?.stats ?? res;
      return {
        total_executions: s?.total_executions ?? 0,
        total_errors: s?.total_errors ?? 0,
        error_rate: s?.error_rate ?? 0,
        p50_duration_ms: s?.p50_duration_ms ?? 0,
        p95_duration_ms: s?.p95_duration_ms ?? 0,
        p99_duration_ms: s?.p99_duration_ms ?? 0,
      };
    } catch (err) {
      if (this.enableFallback) {
        return {
          total_executions: 142050,
          total_errors: 124,
          error_rate: 0.00087,
          p50_duration_ms: 4.2,
          p95_duration_ms: 18.5,
          p99_duration_ms: 45.1,
        };
      }
      throw err;
    }
  }

  /**
   * Fetches the list of all observed functions across services.
   */
  async fetchFunctions(service?: string): Promise<FunctionSummary[]> {
    try {
      const query = service ? `?service=${encodeURIComponent(service)}` : '';
      const res = await this.request<any>(`/v1/functions${query}`);
      const list = Array.isArray(res) ? res : (res?.functions ?? []);
      return list.map((fn: any) => ({
        function_id: fn.function_id || `${fn.service_name}:${fn.module_name || fn.module}:${fn.function_name}`,
        service_name: fn.service_name,
        module: fn.module || fn.module_name || '',
        class_name: fn.class_name || undefined,
        function_name: fn.function_name,
        total_executions: fn.total_executions ?? fn.call_count ?? 0,
        total_errors: fn.total_errors ?? fn.error_count ?? 0,
        avg_duration_ms: fn.avg_duration_ms ?? 0,
        last_seen: fn.last_seen || new Date().toISOString(),
      }));
    } catch (err) {
      if (this.enableFallback) {
        return [
          {
            function_id: 'fn-order-checkout',
            service_name: 'order-service',
            module: 'src/services/order.ts',
            class_name: 'OrderController',
            function_name: 'checkout',
            total_executions: 28400,
            total_errors: 12,
            avg_duration_ms: 14.8,
            last_seen: new Date().toISOString(),
          },
          {
            function_id: 'fn-payment-charge',
            service_name: 'payment-service',
            module: 'src/services/payment.ts',
            class_name: 'PaymentProcessor',
            function_name: 'chargeCard',
            total_executions: 19500,
            total_errors: 45,
            avg_duration_ms: 82.4,
            last_seen: new Date().toISOString(),
          },
          {
            function_id: 'fn-inventory-reserve',
            service_name: 'inventory-service',
            module: 'src/services/inventory.ts',
            class_name: 'InventoryStore',
            function_name: 'reserveStock',
            total_executions: 31200,
            total_errors: 2,
            avg_duration_ms: 3.1,
            last_seen: new Date().toISOString(),
          },
        ];
      }
      throw err;
    }
  }

  /**
   * Fetches recent executions of a specific function.
   */
  async fetchFunctionExecutions(functionId: string, limit: number = 50): Promise<ExecutionRecord[]> {
    try {
      const res = await this.request<any>(
        `/v1/functions/${encodeURIComponent(functionId)}/executions?limit=${limit}`
      );
      const list = Array.isArray(res) ? res : (res?.executions ?? []);
      return list.map((e: any) => this.mapExecutionRecord(e));
    } catch (err) {
      if (this.enableFallback) {
        return [
          {
            execution_id: 'exec-001',
            trace_id: '0af7651916cd43dd8448eb211c80319c',
            span_id: 'b7ad6b7169203331',
            service_name: 'order-service',
            environment: 'production',
            module: 'src/services/order.ts',
            class_name: 'OrderController',
            function_name: 'checkout',
            status: 'success',
            duration_ms: 12.4,
            timestamp: new Date().toISOString(),
            input_payload: { order_id: 'ord_9012', items: 2 },
            output_payload: { confirmed: true, invoice: 'inv_88' },
          },
          {
            execution_id: 'exec-002',
            trace_id: '0af7651916cd43dd8448eb211c80319c',
            span_id: 'b7ad6b7169203332',
            parent_span_id: 'b7ad6b7169203331',
            service_name: 'order-service',
            environment: 'production',
            module: 'src/services/order.ts',
            class_name: 'OrderController',
            function_name: 'validatePromo',
            status: 'error',
            duration_ms: 3.2,
            timestamp: new Date().toISOString(),
            input_payload: { promo_code: 'EXPIRED2024' },
            error: {
              type_name: 'PromoExpiredError',
              message: 'Promo coupon EXPIRED2024 is no longer valid',
            },
          },
        ];
      }
      throw err;
    }
  }

  /**
   * Fetches details of a single execution record.
   */
  async fetchExecution(executionId: string): Promise<ExecutionRecord> {
    try {
      const res = await this.request<any>(
        `/v1/executions/${encodeURIComponent(executionId)}`
      );
      const e = res?.execution ?? res;
      return this.mapExecutionRecord(e);
    } catch (err) {
      if (this.enableFallback) {
        return {
          execution_id: executionId,
          trace_id: '0af7651916cd43dd8448eb211c80319c',
          span_id: 'b7ad6b7169203331',
          service_name: 'order-service',
          environment: 'production',
          module: 'src/services/order.ts',
          class_name: 'OrderController',
          function_name: 'checkout',
          status: 'success',
          duration_ms: 14.8,
          timestamp: new Date().toISOString(),
          input_payload: { order_id: 'ord_5521', amount: 120.0 },
          output_payload: { status: 'completed' },
        };
      }
      throw err;
    }
  }

  /**
   * Fetches hierarchical distributed trace tree.
   */
  async fetchTrace(traceId: string): Promise<TraceTree> {
    try {
      const res = await this.request<any>(
        `/v1/traces/${encodeURIComponent(traceId)}`
      );
      const t = res?.trace ?? res;
      const rawRoots = t?.root_spans ?? t?.roots ?? [];
      const root_spans = rawRoots.map((node: any) => this.mapTraceNode(node));
      return {
        trace_id: t?.trace_id || traceId,
        total_spans: t?.total_spans ?? root_spans.length,
        total_duration_ms: t?.total_duration_ms ?? 0,
        root_spans,
      };
    } catch (err) {
      if (this.enableFallback) {
        return {
          trace_id: traceId,
          total_spans: 3,
          total_duration_ms: 110.2,
          root_spans: [
            {
              span_id: 'root-span-01',
              service_name: 'order-service',
              module: 'src/services/order.ts',
              class_name: 'OrderController',
              function_name: 'checkout',
              status: 'success',
              duration_ms: 110.2,
              timestamp: new Date().toISOString(),
              children: [
                {
                  span_id: 'child-span-02',
                  parent_span_id: 'root-span-01',
                  service_name: 'inventory-service',
                  module: 'src/services/inventory.ts',
                  class_name: 'InventoryStore',
                  function_name: 'reserveStock',
                  status: 'success',
                  duration_ms: 15.4,
                  timestamp: new Date().toISOString(),
                  children: [],
                },
                {
                  span_id: 'child-span-03',
                  parent_span_id: 'root-span-01',
                  service_name: 'payment-service',
                  module: 'src/services/payment.ts',
                  class_name: 'PaymentProcessor',
                  function_name: 'chargeCard',
                  status: 'success',
                  duration_ms: 82.1,
                  timestamp: new Date().toISOString(),
                  children: [],
                },
              ],
            },
          ],
        };
      }
      throw err;
    }
  }

  private mapExecutionRecord(e: any): ExecutionRecord {
    let input_payload = e.input_payload;
    if (!input_payload && e.input_json) {
      try {
        input_payload = JSON.parse(e.input_json);
      } catch {
        input_payload = e.input_json;
      }
    }
    let output_payload = e.output_payload;
    if (!output_payload && e.output_json) {
      try {
        output_payload = JSON.parse(e.output_json);
      } catch {
        output_payload = e.output_json;
      }
    }
    let error = e.error;
    if (!error && (e.error_type || e.error_message)) {
      error = {
        type_name: e.error_type || 'Error',
        message: e.error_message || '',
        stack_trace: e.error_stack || undefined,
      };
    }
    return {
      execution_id: e.execution_id || e.event_id || e.span_id || '',
      trace_id: e.trace_id,
      span_id: e.span_id,
      parent_span_id: e.parent_span_id || undefined,
      service_name: e.service_name,
      environment: e.environment,
      module: e.module || e.module_name || '',
      class_name: e.class_name || undefined,
      function_name: e.function_name,
      status: e.status,
      duration_ms: e.duration_ms,
      timestamp: e.timestamp,
      input_payload,
      output_payload,
      error,
    };
  }

  private mapTraceNode(node: any): TraceNode {
    const exec = node.execution ?? {};
    return {
      span_id: node.span_id || exec.span_id || '',
      parent_span_id: node.parent_span_id || exec.parent_span_id || undefined,
      service_name: node.service_name || exec.service_name || '',
      module: node.module || exec.module_name || '',
      class_name: node.class_name || exec.class_name || undefined,
      function_name: node.function_name || exec.function_name || '',
      status: node.status || exec.status || 'success',
      duration_ms: node.duration_ms ?? exec.duration_ms ?? 0,
      timestamp: node.timestamp || exec.timestamp || new Date().toISOString(),
      children: Array.isArray(node.children) ? node.children.map((c: any) => this.mapTraceNode(c)) : [],
    };
  }
}

export const defaultApiClient = new EventsLogApiClient();
