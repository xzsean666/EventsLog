import type {
  ServiceStats,
  FunctionSummary,
  ExecutionRecord,
  TraceTree,
  TraceNode,
} from './types.js';
import { EventsLogApiClient } from './client.js';

export type ProviderType = 'http_remote' | 'http_local' | 'indexeddb';

export interface TelemetryDataProvider {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType;
  readonly description: string;
  isAvailable(): Promise<boolean>;
  fetchStats(): Promise<ServiceStats>;
  fetchFunctions(service?: string): Promise<FunctionSummary[]>;
  fetchFunctionExecutions(functionId: string, limit?: number): Promise<ExecutionRecord[]>;
  fetchExecution(executionId: string): Promise<ExecutionRecord>;
  fetchTrace(traceId: string): Promise<TraceTree>;
}

export interface HttpProviderOptions {
  id: string;
  name: string;
  type: 'http_remote' | 'http_local';
  description: string;
  baseUrl?: string;
  apiKey?: string;
  enableFallback?: boolean;
}

/**
 * Data provider backed by HTTP API (Remote ClickHouse Query Service or Local Rust SQLite Service).
 */
export class HttpDataProvider implements TelemetryDataProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'http_remote' | 'http_local';
  readonly description: string;
  private readonly client: EventsLogApiClient;
  private readonly baseUrl: string;

  constructor(options: HttpProviderOptions) {
    this.id = options.id;
    this.name = options.name;
    this.type = options.type;
    this.description = options.description;
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
    this.client = new EventsLogApiClient({
      baseUrl: this.baseUrl,
      apiKey: options.apiKey,
      enableFallback: options.enableFallback ?? false,
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async fetchStats(): Promise<ServiceStats> {
    return this.client.fetchStats();
  }

  async fetchFunctions(service?: string): Promise<FunctionSummary[]> {
    return this.client.fetchFunctions(service);
  }

  async fetchFunctionExecutions(functionId: string, limit: number = 50): Promise<ExecutionRecord[]> {
    return this.client.fetchFunctionExecutions(functionId, limit);
  }

  async fetchExecution(executionId: string): Promise<ExecutionRecord> {
    return this.client.fetchExecution(executionId);
  }

  async fetchTrace(traceId: string): Promise<TraceTree> {
    return this.client.fetchTrace(traceId);
  }
}

export interface IndexedDBProviderOptions {
  id?: string;
  name?: string;
  description?: string;
  dbName?: string;
}

/**
 * Data provider reading directly from the browser's native IndexedDB without any server or network calls.
 */
export class IndexedDBDataProvider implements TelemetryDataProvider {
  readonly id: string;
  readonly name: string;
  readonly type = 'indexeddb' as const;
  readonly description: string;
  private readonly dbName: string;

  constructor(options: IndexedDBProviderOptions = {}) {
    this.id = options.id || 'indexeddb';
    this.name = options.name || 'Browser Local (IndexedDB)';
    this.description =
      options.description || 'Direct in-browser telemetry stored by @eventslog/browser';
    this.dbName = options.dbName || 'eventslog_db';
  }

  async isAvailable(): Promise<boolean> {
    const idb = this.getIDBFactory();
    return !!idb;
  }

  private getIDBFactory(): IDBFactory | undefined {
    if (typeof indexedDB !== 'undefined') {
      return indexedDB;
    }
    if (typeof globalThis !== 'undefined' && 'indexedDB' in globalThis) {
      return (globalThis as any).indexedDB;
    }
    return undefined;
  }

  private async openDatabase(): Promise<IDBDatabase | null> {
    const idb = this.getIDBFactory();
    if (!idb) return null;

    return new Promise((resolve) => {
      try {
        const req = idb.open(this.dbName, 1);
        req.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('executions')) {
            const store = db.createObjectStore('executions', { keyPath: 'event_id' });
            store.createIndex('trace_id', 'trace_id', { unique: false });
            store.createIndex('span_id', 'span_id', { unique: false });
            store.createIndex('function_name', 'function_name', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('service_name', 'service_name', { unique: false });
            store.createIndex('status', 'status', { unique: false });
          }
        };
        req.onsuccess = (event) => {
          resolve((event.target as IDBOpenDBRequest).result);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async getAllRows(): Promise<any[]> {
    const db = await this.openDatabase();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['executions'], 'readonly');
        const store = tx.objectStore('executions');

        if (typeof store.getAll === 'function') {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } else {
          const rows: any[] = [];
          const req = store.openCursor();
          req.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              rows.push(cursor.value);
              cursor.continue();
            } else {
              resolve(rows);
            }
          };
          req.onerror = () => resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
  }

  async fetchStats(): Promise<ServiceStats> {
    const rows = await this.getAllRows();
    const total_executions = rows.length;
    const total_errors = rows.filter((r) => r.status === 'error').length;
    const error_rate = total_executions > 0 ? total_errors / total_executions : 0.0;

    const durations = rows.map((r) => Number(r.duration_ms) || 0).sort((a, b) => a - b);
    let p50 = 0.0;
    let p95 = 0.0;
    let p99 = 0.0;

    if (durations.length > 0) {
      const n = durations.length;
      p50 = durations[Math.min(n - 1, Math.floor(n * 0.5))];
      p95 = durations[Math.min(n - 1, Math.floor(n * 0.95))];
      p99 = durations[Math.min(n - 1, Math.floor(n * 0.99))];
    }

    return {
      total_executions,
      total_errors,
      error_rate,
      p50_duration_ms: p50,
      p95_duration_ms: p95,
      p99_duration_ms: p99,
    };
  }

  async fetchFunctions(service?: string): Promise<FunctionSummary[]> {
    const rows = await this.getAllRows();
    const filtered = service ? rows.filter((r) => r.service_name === service) : rows;

    interface Agg {
      function_id: string;
      service_name: string;
      module: string;
      class_name?: string;
      function_name: string;
      total_executions: number;
      total_errors: number;
      total_duration_ms: number;
      last_seen: string;
    }

    const map = new Map<string, Agg>();

    for (const r of filtered) {
      const serviceName = r.service_name || 'frontend';
      const moduleName = r.module_name || r.module || 'app';
      const funcName = r.function_name || 'anonymous';
      const fnId = `${serviceName}:${moduleName}:${funcName}`;

      let agg = map.get(fnId);
      if (!agg) {
        agg = {
          function_id: fnId,
          service_name: serviceName,
          module: moduleName,
          class_name: r.class_name || undefined,
          function_name: funcName,
          total_executions: 0,
          total_errors: 0,
          total_duration_ms: 0,
          last_seen: r.timestamp || new Date().toISOString(),
        };
        map.set(fnId, agg);
      }

      agg.total_executions += 1;
      if (r.status === 'error') {
        agg.total_errors += 1;
      }
      agg.total_duration_ms += Number(r.duration_ms) || 0;
      if (new Date(r.timestamp) > new Date(agg.last_seen)) {
        agg.last_seen = r.timestamp;
      }
    }

    const summaries: FunctionSummary[] = Array.from(map.values()).map((agg) => ({
      function_id: agg.function_id,
      service_name: agg.service_name,
      module: agg.module,
      class_name: agg.class_name,
      function_name: agg.function_name,
      total_executions: agg.total_executions,
      total_errors: agg.total_errors,
      avg_duration_ms:
        agg.total_executions > 0 ? agg.total_duration_ms / agg.total_executions : 0.0,
      last_seen: agg.last_seen,
    }));

    summaries.sort((a, b) => b.total_executions - a.total_executions);
    return summaries;
  }

  async fetchFunctionExecutions(functionId: string, limit: number = 50): Promise<ExecutionRecord[]> {
    const rows = await this.getAllRows();

    const matched = rows.filter((r) => {
      const fnId = `${r.service_name}:${r.module_name || r.module}:${r.function_name}`;
      return fnId === functionId || r.function_name === functionId;
    });

    matched.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return matched.slice(0, limit).map((r) => this.mapExecution(r));
  }

  async fetchExecution(executionId: string): Promise<ExecutionRecord> {
    const rows = await this.getAllRows();
    const found = rows.find(
      (r) => r.event_id === executionId || r.span_id === executionId || r.execution_id === executionId
    );
    if (!found) {
      throw new Error(`Execution record not found: ${executionId}`);
    }
    return this.mapExecution(found);
  }

  async fetchTrace(traceId: string): Promise<TraceTree> {
    const rows = await this.getAllRows();
    let actualTraceId = traceId;
    let traceRows = rows.filter((r) => r.trace_id === actualTraceId);

    // If requested demo trace not found but other recorded traces exist, display the first recorded trace
    if (traceRows.length === 0 && rows.length > 0) {
      actualTraceId = rows[0].trace_id;
      traceRows = rows.filter((r) => r.trace_id === actualTraceId);
    }

    if (traceRows.length === 0) {
      return {
        trace_id: traceId,
        root_spans: [],
        total_spans: 0,
        total_duration_ms: 0,
      };
    }

    traceRows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const knownSpans = new Set<string>(traceRows.map((r) => r.span_id));
    const childrenMap = new Map<string, string[]>();
    const spanLookup = new Map<string, any>();
    const rootIds: string[] = [];

    for (const span of traceRows) {
      const spanId = span.span_id;
      const parentId = span.parent_span_id;

      if (!parentId || parentId === spanId || !knownSpans.has(parentId)) {
        rootIds.push(spanId);
      } else {
        const existing = childrenMap.get(parentId) || [];
        existing.push(spanId);
        childrenMap.set(parentId, existing);
      }

      spanLookup.set(spanId, span);
    }

    function assembleNode(spanId: string): TraceNode | null {
      const row = spanLookup.get(spanId);
      if (!row) return null;

      const childIds = childrenMap.get(spanId) || [];
      const children: TraceNode[] = [];
      for (const childId of childIds) {
        const child = assembleNode(childId);
        if (child) children.push(child);
      }

      return {
        span_id: row.span_id,
        parent_span_id: row.parent_span_id || undefined,
        service_name: row.service_name || 'frontend',
        module: row.module_name || row.module || '',
        class_name: row.class_name || undefined,
        function_name: row.function_name || 'anonymous',
        status: row.status || 'success',
        duration_ms: Number(row.duration_ms) || 0,
        timestamp: row.timestamp || new Date().toISOString(),
        children,
      };
    }

    const rootSpans: TraceNode[] = [];
    for (const rootId of rootIds) {
      const node = assembleNode(rootId);
      if (node) rootSpans.push(node);
    }

    const totalDurationMs = rootSpans.reduce(
      (acc, root) => Math.max(acc, root.duration_ms),
      0
    );

    return {
      trace_id: traceId,
      root_spans: rootSpans,
      total_spans: traceRows.length,
      total_duration_ms: totalDurationMs,
    };
  }

  private mapExecution(r: any): ExecutionRecord {
    let inputPayload = r.input_payload;
    if (!inputPayload && r.input_json) {
      try {
        inputPayload = JSON.parse(r.input_json);
      } catch {
        inputPayload = r.input_json;
      }
    }
    let outputPayload = r.output_payload;
    if (!outputPayload && r.output_json) {
      try {
        outputPayload = JSON.parse(r.output_json);
      } catch {
        outputPayload = r.output_json;
      }
    }

    let error = r.error;
    if (!error && (r.error_type || r.error_message)) {
      error = {
        type_name: r.error_type || 'Error',
        message: r.error_message || '',
        stack_trace: r.error_stack || undefined,
      };
    }

    return {
      execution_id: r.event_id || r.span_id || '',
      trace_id: r.trace_id,
      span_id: r.span_id,
      parent_span_id: r.parent_span_id || undefined,
      service_name: r.service_name || 'frontend',
      environment: r.environment || 'development',
      module: r.module_name || r.module || '',
      class_name: r.class_name || undefined,
      function_name: r.function_name || 'anonymous',
      status: r.status || 'success',
      duration_ms: Number(r.duration_ms) || 0,
      timestamp: r.timestamp || new Date().toISOString(),
      input_payload: inputPayload,
      output_payload: outputPayload,
      error,
    };
  }
}

/**
 * Registry managing available telemetry data providers and active provider selection.
 */
export class ProviderRegistry {
  private readonly providers: Map<string, TelemetryDataProvider> = new Map();
  private activeProviderId: string;

  constructor() {
    // 1. Remote ClickHouse Service
    const remote = new HttpDataProvider({
      id: 'remote',
      name: 'Remote Cluster',
      type: 'http_remote',
      description: 'Distributed ClickHouse backend (http://localhost:8002)',
      baseUrl: '',
      enableFallback: true,
    });

    // 2. Local Rust SQLite Service
    const localSqlite = new HttpDataProvider({
      id: 'local_sqlite',
      name: 'Local SQLite Service',
      type: 'http_local',
      description: 'In-process / local SQLite service (http://localhost:8080)',
      baseUrl: 'http://localhost:8080',
      enableFallback: true,
    });

    // 3. Browser Native IndexedDB
    const indexedDb = new IndexedDBDataProvider({
      id: 'indexeddb',
      name: 'Browser Local (IndexedDB)',
      description: 'In-browser IndexedDB storage with zero server dependencies',
      dbName: 'eventslog_db',
    });

    this.register(remote);
    this.register(localSqlite);
    this.register(indexedDb);

    this.activeProviderId = 'remote';
  }

  register(provider: TelemetryDataProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProviders(): TelemetryDataProvider[] {
    return Array.from(this.providers.values());
  }

  getProvider(id: string): TelemetryDataProvider | undefined {
    return this.providers.get(id);
  }

  getActiveProviderId(): string {
    return this.activeProviderId;
  }

  getActiveProvider(): TelemetryDataProvider {
    return this.providers.get(this.activeProviderId) || this.providers.get('remote')!;
  }

  setActiveProvider(id: string): boolean {
    if (this.providers.has(id)) {
      this.activeProviderId = id;
      return true;
    }
    return false;
  }
}

export const defaultProviderRegistry = new ProviderRegistry();
