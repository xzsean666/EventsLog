import {
  Event,
  ExecutionRow,
  FunctionSummary,
  TraceNode,
  TraceResponse,
  StatsResponse,
  FunctionFilter,
  ExecutionFilter,
} from '../protocol/types';

export interface IndexedDBStorageOptions {
  dbName?: string;
  version?: number;
}

/**
 * Reconstructs a hierarchical trace tree from a flat list of execution spans.
 * Handles broken or sampled traces by promoting orphaned spans to root nodes.
 */
export function buildTraceTree(traceId: string, spans: ExecutionRow[]): TraceResponse {
  const totalSpans = spans.length;
  if (totalSpans === 0) {
    return {
      trace_id: traceId,
      roots: [],
      root_spans: [],
      total_spans: 0,
      total_duration_ms: 0.0,
    };
  }

  const knownSpans = new Set<string>(spans.map((s) => s.span_id));
  const childrenMap = new Map<string, string[]>();
  const spanLookup = new Map<string, ExecutionRow>();
  const rootIds: string[] = [];

  for (const span of spans) {
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
    const execution = spanLookup.get(spanId);
    if (!execution) return null;

    const childIds = childrenMap.get(spanId) || [];
    const children: TraceNode[] = [];
    for (const childId of childIds) {
      const childNode = assembleNode(childId);
      if (childNode) {
        children.push(childNode);
      }
    }

    return {
      span_id: execution.span_id,
      parent_span_id: execution.parent_span_id,
      service_name: execution.service_name,
      module: execution.module_name,
      class_name: execution.class_name,
      function_name: execution.function_name,
      status: execution.status,
      duration_ms: execution.duration_ms,
      timestamp: execution.timestamp,
      execution,
      children,
    };
  }

  const roots: TraceNode[] = [];
  for (const rootId of rootIds) {
    const rootNode = assembleNode(rootId);
    if (rootNode) {
      roots.push(rootNode);
    }
  }

  const totalDurationMs = roots.reduce((acc, root) => Math.max(acc, root.duration_ms), 0);

  return {
    trace_id: traceId,
    roots,
    root_spans: roots,
    total_spans: totalSpans,
    total_duration_ms: totalDurationMs,
  };
}

/**
 * Maps an incoming telemetry event into a canonical ExecutionRow for local persistence.
 */
export function eventToExecutionRow(event: Event): ExecutionRow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = event.payload as any;
  const execData = payload?.data || payload;
  const func = execData?.function;
  const err = execData?.error;

  const moduleName = func?.module || 'default';
  const className = func?.class_name || '';
  const functionName = func?.function_name || event.event_type || 'anonymous';
  const filePath = func?.file_path || '';
  const lineNumber = func?.line_number || 0;

  const inputJson =
    execData?.input_payload != null
      ? typeof execData.input_payload === 'string'
        ? execData.input_payload
        : JSON.stringify(execData.input_payload)
      : '';

  const outputJson =
    execData?.output_payload != null
      ? typeof execData.output_payload === 'string'
        ? execData.output_payload
        : JSON.stringify(execData.output_payload)
      : '';

  const durationNanos = typeof execData?.duration_nanos === 'number' ? execData.duration_nanos : 0;
  const durationMs = durationNanos > 0 ? durationNanos / 1_000_000 : 0.0;
  const status = execData?.status || 'success';

  const errorType = err?.type_name || '';
  const errorMessage = err?.message || '';
  const errorStack = err?.stack_trace || '';

  const attributesJson =
    payload?.attributes != null
      ? typeof payload.attributes === 'string'
        ? payload.attributes
        : JSON.stringify(payload.attributes)
      : '';

  const timestampStr =
    typeof event.timestamp === 'string'
      ? event.timestamp
      : String(event.timestamp || new Date().toISOString());

  return {
    event_id: event.event_id,
    trace_id: event.trace_id,
    span_id: event.span_id,
    parent_span_id: event.parent_span_id || '',
    service_name: event.service_name,
    environment: event.environment,
    module_name: moduleName,
    class_name: className,
    function_name: functionName,
    file_path: filePath,
    line_number: lineNumber,
    input_json: inputJson,
    output_json: outputJson,
    duration_ms: durationMs,
    duration_nanos: durationNanos,
    status,
    error_type: errorType,
    error_message: errorMessage,
    error_stack: errorStack,
    attributes_json: attributesJson,
    timestamp: timestampStr,
  };
}

/**
 * In-browser persistent storage engine backed by native IndexedDB.
 * Enables 100% zero-server local development, debugging, and offline telemetry capture.
 */
export class IndexedDBStorage {
  private readonly dbName: string;
  private readonly version: number;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase | null> | null = null;

  constructor(options: IndexedDBStorageOptions = {}) {
    this.dbName = options.dbName || 'eventslog_db';
    this.version = options.version ?? 1;
  }

  /**
   * Initializes or retrieves the active IndexedDB connection.
   */
  async open(): Promise<IDBDatabase | null> {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve) => {
      const idb =
        typeof indexedDB !== 'undefined'
          ? indexedDB
          : typeof globalThis !== 'undefined' && 'indexedDB' in globalThis
            ? (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB
            : undefined;

      if (!idb) {
        resolve(null);
        return;
      }

      try {
        const request = idb.open(this.dbName, this.version);

        request.onupgradeneeded = (event) => {
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

        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          resolve(this.db);
        };

        request.onerror = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });

    return this.initPromise;
  }

  /**
   * Persists an event batch to IndexedDB inside a single readwrite transaction.
   */
  async insertBatch(events: Event[]): Promise<boolean> {
    if (!events || events.length === 0) {
      return true;
    }

    const db = await this.open();
    if (!db) {
      return false;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['executions'], 'readwrite');
        const store = tx.objectStore('executions');

        for (const event of events) {
          const row = eventToExecutionRow(event);
          store.put(row);
        }

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Queries aggregated function summaries matching the filter.
   */
  async listFunctions(filter: FunctionFilter = {}): Promise<FunctionSummary[]> {
    const db = await this.open();
    if (!db) {
      return [];
    }

    const rows = await this.getAllRows();
    const serviceFilter = filter.service_name;
    const envFilter = filter.environment;
    const searchFilter = filter.search ? filter.search.toLowerCase() : undefined;
    const limit = filter.limit ?? 100;

    // Filter rows
    const filtered = rows.filter((r) => {
      if (serviceFilter && r.service_name !== serviceFilter) return false;
      if (envFilter && r.environment !== envFilter) return false;
      if (searchFilter) {
        const matchName = r.function_name.toLowerCase().includes(searchFilter);
        const matchMod = r.module_name.toLowerCase().includes(searchFilter);
        if (!matchName && !matchMod) return false;
      }
      return true;
    });

    // Group by function identity
    interface Aggregation {
      function_id: string;
      service_name: string;
      module_name: string;
      class_name: string | null;
      function_name: string;
      call_count: number;
      error_count: number;
      total_duration_ms: number;
      last_seen: string;
    }

    const groups = new Map<string, Aggregation>();

    for (const row of filtered) {
      const funcId = `${row.service_name}:${row.module_name}:${row.function_name}`;
      let agg = groups.get(funcId);
      if (!agg) {
        agg = {
          function_id: funcId,
          service_name: row.service_name,
          module_name: row.module_name,
          class_name: row.class_name ? row.class_name : null,
          function_name: row.function_name,
          call_count: 0,
          error_count: 0,
          total_duration_ms: 0,
          last_seen: row.timestamp,
        };
        groups.set(funcId, agg);
      }

      agg.call_count += 1;
      if (row.status === 'error') {
        agg.error_count += 1;
      }
      agg.total_duration_ms += row.duration_ms;

      if (!agg.class_name && row.class_name) {
        agg.class_name = row.class_name;
      }
      if (new Date(row.timestamp) > new Date(agg.last_seen)) {
        agg.last_seen = row.timestamp;
      }
    }

    const summaries: FunctionSummary[] = Array.from(groups.values()).map((agg) => {
      const avgDuration = agg.call_count > 0 ? agg.total_duration_ms / agg.call_count : 0.0;
      return {
        function_id: agg.function_id,
        service_name: agg.service_name,
        module_name: agg.module_name,
        module: agg.module_name,
        class_name: agg.class_name,
        function_name: agg.function_name,
        call_count: agg.call_count,
        total_executions: agg.call_count,
        error_count: agg.error_count,
        total_errors: agg.error_count,
        avg_duration_ms: avgDuration,
        last_seen: agg.last_seen,
      };
    });

    // Sort descending by call count
    summaries.sort((a, b) => b.call_count - a.call_count);

    return summaries.slice(0, limit);
  }

  /**
   * Queries individual execution records matching the filter.
   */
  async listExecutions(filter: ExecutionFilter = {}): Promise<ExecutionRow[]> {
    const db = await this.open();
    if (!db) {
      return [];
    }

    const rows = await this.getAllRows();
    const serviceFilter = filter.service_name;
    const envFilter = filter.environment;
    const funcFilter = filter.function_name;
    const statusFilter = filter.status;
    const traceFilter = filter.trace_id;
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const filtered = rows.filter((r) => {
      if (serviceFilter && r.service_name !== serviceFilter) return false;
      if (envFilter && r.environment !== envFilter) return false;
      if (funcFilter && r.function_name !== funcFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (traceFilter && r.trace_id !== traceFilter) return false;
      return true;
    });

    // Sort descending by timestamp
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return filtered.slice(offset, offset + limit);
  }

  /**
   * Retrieves a single execution record by its unique event ID.
   */
  async getExecution(eventId: string): Promise<ExecutionRow | null> {
    const db = await this.open();
    if (!db) {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['executions'], 'readonly');
        const store = tx.objectStore('executions');
        const request = store.get(eventId);

        request.onsuccess = () => {
          resolve((request.result as ExecutionRow) || null);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Retrieves all spans for a trace and reconstructs the hierarchical execution tree.
   */
  async getTrace(traceId: string): Promise<TraceResponse | null> {
    const db = await this.open();
    if (!db) {
      return null;
    }

    const rows = await this.getAllRows();
    const traceSpans = rows.filter((r) => r.trace_id === traceId);

    if (traceSpans.length === 0) {
      return null;
    }

    // Sort ascending by timestamp
    traceSpans.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return buildTraceTree(traceId, traceSpans);
  }

  /**
   * Computes platform overview statistics matching StatsResponse.
   */
  async getStats(serviceName?: string, environment?: string): Promise<StatsResponse> {
    const db = await this.open();
    if (!db) {
      return {
        total_executions: 0,
        total_errors: 0,
        error_rate: 0.0,
        p50_duration_ms: 0.0,
        p95_duration_ms: 0.0,
        p99_duration_ms: 0.0,
      };
    }

    const rows = await this.getAllRows();
    const filtered = rows.filter((r) => {
      if (serviceName && r.service_name !== serviceName) return false;
      if (environment && r.environment !== environment) return false;
      return true;
    });

    const totalExecutions = filtered.length;
    const totalErrors = filtered.filter((r) => r.status === 'error').length;
    const errorRate = totalExecutions > 0 ? totalErrors / totalExecutions : 0.0;

    const durations = filtered.map((r) => r.duration_ms).sort((a, b) => a - b);

    let p50 = 0.0;
    let p95 = 0.0;
    let p99 = 0.0;

    if (durations.length > 0) {
      const n = durations.length;
      const p50Idx = Math.min(n - 1, Math.floor(n * 0.5));
      const p95Idx = Math.min(n - 1, Math.floor(n * 0.95));
      const p99Idx = Math.min(n - 1, Math.floor(n * 0.99));
      p50 = durations[p50Idx];
      p95 = durations[p95Idx];
      p99 = durations[p99Idx];
    }

    return {
      total_executions: totalExecutions,
      total_errors: totalErrors,
      error_rate: errorRate,
      p50_duration_ms: p50,
      p95_duration_ms: p95,
      p99_duration_ms: p99,
    };
  }

  /**
   * Clears all executions in the database.
   */
  async clear(): Promise<void> {
    const db = await this.open();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['executions'], 'readwrite');
        const store = tx.objectStore('executions');
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Closes active IndexedDB database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initPromise = null;
  }

  /**
   * Internal helper to retrieve all execution rows from the store.
   */
  private async getAllRows(): Promise<ExecutionRow[]> {
    const db = await this.open();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['executions'], 'readonly');
        const store = tx.objectStore('executions');

        if (typeof store.getAll === 'function') {
          const req = store.getAll();
          req.onsuccess = () => resolve((req.result as ExecutionRow[]) || []);
          req.onerror = () => resolve([]);
        } else {
          // Fallback via cursor for environments without getAll
          const rows: ExecutionRow[] = [];
          const req = store.openCursor();
          req.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              rows.push(cursor.value as ExecutionRow);
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
}
