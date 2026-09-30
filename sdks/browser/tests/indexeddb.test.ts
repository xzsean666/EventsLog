import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  IndexedDBStorage,
  buildTraceTree,
  eventToExecutionRow,
} from '../src/transport/indexeddb';
import { EventsLogBrowserClient } from '../src/client';
import { Event, ExecutionRow } from '../src/protocol/types';

// In-Memory IDB Mock Implementation for Headless Node / Vitest testing
class MockIDBIndex {
  name: string;
  keyPath: string;
  unique: boolean;
  store: MockIDBObjectStore;

  constructor(name: string, keyPath: string, unique: boolean, store: MockIDBObjectStore) {
    this.name = name;
    this.keyPath = keyPath;
    this.unique = unique;
    this.store = store;
  }

  getAll(key?: unknown): IDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      const records = Array.from(this.store.records.values());
      if (key !== undefined) {
        req.result = records.filter((r) => (r as any)[this.keyPath] === key);
      } else {
        req.result = records;
      }
      if (req.onsuccess) req.onsuccess({ target: req } as any);
    });
    return req as unknown as IDBRequest;
  }
}

class MockIDBObjectStore {
  name: string;
  keyPath: string;
  records: Map<string, any> = new Map();
  indexes: Map<string, MockIDBIndex> = new Map();

  constructor(name: string, keyPath: string) {
    this.name = name;
    this.keyPath = keyPath;
  }

  createIndex(name: string, keyPath: string, options: { unique?: boolean } = {}): MockIDBIndex {
    const idx = new MockIDBIndex(name, keyPath, !!options.unique, this);
    this.indexes.set(name, idx);
    return idx;
  }

  index(name: string): MockIDBIndex {
    const idx = this.indexes.get(name);
    if (!idx) throw new Error(`Index ${name} not found`);
    return idx;
  }

  put(value: any): IDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      const key = value[this.keyPath];
      this.records.set(key, JSON.parse(JSON.stringify(value)));
      req.result = key;
      if (req.onsuccess) req.onsuccess({ target: req } as any);
    });
    return req as unknown as IDBRequest;
  }

  get(key: string): IDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      const val = this.records.get(key);
      req.result = val ? JSON.parse(JSON.stringify(val)) : undefined;
      if (req.onsuccess) req.onsuccess({ target: req } as any);
    });
    return req as unknown as IDBRequest;
  }

  getAll(): IDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      req.result = Array.from(this.records.values()).map((v) => JSON.parse(JSON.stringify(v)));
      if (req.onsuccess) req.onsuccess({ target: req } as any);
    });
    return req as unknown as IDBRequest;
  }

  clear(): IDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      this.records.clear();
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({ target: req } as any);
    });
    return req as unknown as IDBRequest;
  }
}

class MockIDBTransaction {
  storeNames: string[];
  mode: string;
  db: MockIDBDatabase;
  oncomplete: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onabort: ((event: any) => void) | null = null;

  constructor(db: MockIDBDatabase, storeNames: string[], mode: string) {
    this.db = db;
    this.storeNames = storeNames;
    this.mode = mode;
    queueMicrotask(() => {
      if (this.oncomplete) {
        this.oncomplete({ target: this });
      }
    });
  }

  objectStore(name: string): MockIDBObjectStore {
    const store = this.db.stores.get(name);
    if (!store) throw new Error(`Object store ${name} not found`);
    return store;
  }
}

class MockIDBDatabase {
  name: string;
  version: number;
  stores: Map<string, MockIDBObjectStore> = new Map();

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
  }

  get objectStoreNames(): { contains: (name: string) => boolean } {
    return {
      contains: (name: string) => this.stores.has(name),
    };
  }

  createObjectStore(name: string, options: { keyPath: string }): MockIDBObjectStore {
    const store = new MockIDBObjectStore(name, options.keyPath);
    this.stores.set(name, store);
    return store;
  }

  transaction(storeNames: string[], mode: string): MockIDBTransaction {
    return new MockIDBTransaction(this, storeNames, mode);
  }

  close(): void {
    // no-op
  }
}

class MockIDBRequest {
  result: any = null;
  error: any = null;
  onsuccess: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onupgradeneeded: ((event: any) => void) | null = null;
}

class MockIDBFactory {
  databases: Map<string, MockIDBDatabase> = new Map();

  open(name: string, version = 1): MockIDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      let db = this.databases.get(name);
      let isUpgrade = false;
      if (!db) {
        db = new MockIDBDatabase(name, version);
        this.databases.set(name, db);
        isUpgrade = true;
      }

      req.result = db;

      if (isUpgrade && req.onupgradeneeded) {
        req.onupgradeneeded({ target: req } as any);
      }
      if (req.onsuccess) {
        req.onsuccess({ target: req } as any);
      }
    });
    return req;
  }
}

describe('IndexedDBStorage & Local Mode', () => {
  let mockIDB: MockIDBFactory;
  let originalIDB: any;

  beforeEach(() => {
    mockIDB = new MockIDBFactory();
    originalIDB = (globalThis as any).indexedDB;
    (globalThis as any).indexedDB = mockIDB;
  });

  afterEach(() => {
    (globalThis as any).indexedDB = originalIDB;
  });

  function makeMockEvent(opts: {
    eventId: string;
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    functionName?: string;
    moduleName?: string;
    status?: 'success' | 'error';
    durationNanos?: number;
    inputPayload?: unknown;
    outputPayload?: unknown;
    error?: { type_name: string; message: string };
    timestamp?: string;
  }): Event {
    return {
      event_id: opts.eventId,
      trace_id: opts.traceId || 'trace-001',
      span_id: opts.spanId || 'span-001',
      parent_span_id: opts.parentSpanId,
      timestamp: opts.timestamp || new Date().toISOString(),
      service_name: 'frontend-web',
      environment: 'development',
      event_type: 'function_execution',
      payload: {
        type: 'function_execution',
        data: {
          function: {
            module: opts.moduleName || 'src.services.auth',
            function_name: opts.functionName || 'loginUser',
            class_name: 'AuthService',
          },
          duration_nanos: opts.durationNanos ?? 45_000_000,
          status: opts.status || 'success',
          input_payload: opts.inputPayload,
          output_payload: opts.outputPayload,
          error: opts.error,
        },
      },
    };
  }

  it('converts telemetry events into canonical ExecutionRows', () => {
    const event = makeMockEvent({
      eventId: 'evt-100',
      traceId: 'tr-100',
      spanId: 'sp-100',
      parentSpanId: 'sp-parent',
      functionName: 'computeHash',
      moduleName: 'utils.crypto',
      durationNanos: 12_500_000,
      inputPayload: { algorithm: 'sha256' },
      outputPayload: { hash: 'a1b2c3d4' },
    });

    const row = eventToExecutionRow(event);
    expect(row.event_id).toBe('evt-100');
    expect(row.trace_id).toBe('tr-100');
    expect(row.span_id).toBe('sp-100');
    expect(row.parent_span_id).toBe('sp-parent');
    expect(row.service_name).toBe('frontend-web');
    expect(row.environment).toBe('development');
    expect(row.module_name).toBe('utils.crypto');
    expect(row.class_name).toBe('AuthService');
    expect(row.function_name).toBe('computeHash');
    expect(row.duration_ms).toBe(12.5);
    expect(row.duration_nanos).toBe(12_500_000);
    expect(row.status).toBe('success');
    expect(row.input_json).toBe(JSON.stringify({ algorithm: 'sha256' }));
    expect(row.output_json).toBe(JSON.stringify({ hash: 'a1b2c3d4' }));
  });

  it('initializes IndexedDB database and execution store with indexes', async () => {
    const storage = new IndexedDBStorage({ dbName: 'test_eventslog_db' });
    const db = await storage.open();

    expect(db).toBeDefined();
    expect(db?.objectStoreNames.contains('executions')).toBe(true);

    const store = (db as any).stores.get('executions') as MockIDBObjectStore;
    expect(store.indexes.has('trace_id')).toBe(true);
    expect(store.indexes.has('span_id')).toBe(true);
    expect(store.indexes.has('function_name')).toBe(true);
    expect(store.indexes.has('timestamp')).toBe(true);
    expect(store.indexes.has('service_name')).toBe(true);
    expect(store.indexes.has('status')).toBe(true);

    storage.close();
  });

  it('persists event batches and retrieves execution by event_id', async () => {
    const storage = new IndexedDBStorage({ dbName: 'test_eventslog_db' });

    const e1 = makeMockEvent({ eventId: 'e-1', functionName: 'loadCart' });
    const e2 = makeMockEvent({
      eventId: 'e-2',
      functionName: 'checkout',
      status: 'error',
      error: { type_name: 'PaymentError', message: 'Card declined' },
    });

    const inserted = await storage.insertBatch([e1, e2]);
    expect(inserted).toBe(true);

    const row1 = await storage.getExecution('e-1');
    expect(row1).not.toBeNull();
    expect(row1?.function_name).toBe('loadCart');
    expect(row1?.status).toBe('success');

    const row2 = await storage.getExecution('e-2');
    expect(row2).not.toBeNull();
    expect(row2?.function_name).toBe('checkout');
    expect(row2?.status).toBe('error');
    expect(row2?.error_type).toBe('PaymentError');
    expect(row2?.error_message).toBe('Card declined');

    const missing = await storage.getExecution('non-existent');
    expect(missing).toBeNull();

    storage.close();
  });

  it('aggregates function summaries matching platform query contracts', async () => {
    const storage = new IndexedDBStorage({ dbName: 'test_eventslog_db' });

    const events = [
      makeMockEvent({ eventId: 'f1-1', functionName: 'getUser', durationNanos: 10_000_000 }),
      makeMockEvent({ eventId: 'f1-2', functionName: 'getUser', durationNanos: 20_000_000 }),
      makeMockEvent({
        eventId: 'f1-3',
        functionName: 'getUser',
        status: 'error',
        durationNanos: 30_000_000,
        error: { type_name: 'NotFound', message: 'User not found' },
      }),
      makeMockEvent({ eventId: 'f2-1', functionName: 'updateProfile', durationNanos: 50_000_000 }),
    ];

    await storage.insertBatch(events);

    const summaries = await storage.listFunctions();
    expect(summaries).toHaveLength(2);

    const getUserSummary = summaries.find((s) => s.function_name === 'getUser')!;
    expect(getUserSummary).toBeDefined();
    expect(getUserSummary.call_count).toBe(3);
    expect(getUserSummary.error_count).toBe(1);
    expect(getUserSummary.avg_duration_ms).toBeCloseTo(20.0);
    expect(getUserSummary.service_name).toBe('frontend-web');

    const updateProfileSummary = summaries.find((s) => s.function_name === 'updateProfile')!;
    expect(updateProfileSummary).toBeDefined();
    expect(updateProfileSummary.call_count).toBe(1);
    expect(updateProfileSummary.error_count).toBe(0);
    expect(updateProfileSummary.avg_duration_ms).toBeCloseTo(50.0);

    // Search filter
    const searchResult = await storage.listFunctions({ search: 'update' });
    expect(searchResult).toHaveLength(1);
    expect(searchResult[0].function_name).toBe('updateProfile');

    storage.close();
  });

  it('lists and paginates execution records with status and trace filtering', async () => {
    const storage = new IndexedDBStorage({ dbName: 'test_eventslog_db' });

    const events = [
      makeMockEvent({
        eventId: 'ex-1',
        traceId: 'tr-A',
        functionName: 'fetchData',
        status: 'success',
        timestamp: '2026-09-29T10:00:00Z',
      }),
      makeMockEvent({
        eventId: 'ex-2',
        traceId: 'tr-A',
        functionName: 'fetchData',
        status: 'error',
        timestamp: '2026-09-29T10:01:00Z',
      }),
      makeMockEvent({
        eventId: 'ex-3',
        traceId: 'tr-B',
        functionName: 'renderView',
        status: 'success',
        timestamp: '2026-09-29T10:02:00Z',
      }),
    ];

    await storage.insertBatch(events);

    // Query all sorted descending by timestamp
    const all = await storage.listExecutions();
    expect(all).toHaveLength(3);
    expect(all[0].event_id).toBe('ex-3');
    expect(all[1].event_id).toBe('ex-2');
    expect(all[2].event_id).toBe('ex-1');

    // Filter by trace_id
    const traceAExecutions = await storage.listExecutions({ trace_id: 'tr-A' });
    expect(traceAExecutions).toHaveLength(2);

    // Filter by status
    const errorExecutions = await storage.listExecutions({ status: 'error' });
    expect(errorExecutions).toHaveLength(1);
    expect(errorExecutions[0].event_id).toBe('ex-2');

    // Limit and offset
    const paginated = await storage.listExecutions({ limit: 1, offset: 1 });
    expect(paginated).toHaveLength(1);
    expect(paginated[0].event_id).toBe('ex-2');

    storage.close();
  });

  it('reconstructs hierarchical trace trees with nested spans and compute durations', async () => {
    const storage = new IndexedDBStorage({ dbName: 'test_eventslog_db' });

    // Build trace tree:
    // Root: handleCheckout (span-1)
    //   Child: validateCart (span-2)
    //   Child: chargeCard (span-3)
    //     Grandchild: callStripeAPI (span-4)
    const traceId = 'trace-checkout-100';
    const spans: Event[] = [
      makeMockEvent({
        eventId: 'e-root',
        traceId,
        spanId: 'span-1',
        parentSpanId: undefined,
        functionName: 'handleCheckout',
        durationNanos: 120_000_000,
        timestamp: '2026-09-29T10:00:00.000Z',
      }),
      makeMockEvent({
        eventId: 'e-c1',
        traceId,
        spanId: 'span-2',
        parentSpanId: 'span-1',
        functionName: 'validateCart',
        durationNanos: 20_000_000,
        timestamp: '2026-09-29T10:00:00.010Z',
      }),
      makeMockEvent({
        eventId: 'e-c2',
        traceId,
        spanId: 'span-3',
        parentSpanId: 'span-1',
        functionName: 'chargeCard',
        durationNanos: 80_000_000,
        timestamp: '2026-09-29T10:00:00.035Z',
      }),
      makeMockEvent({
        eventId: 'e-gc1',
        traceId,
        spanId: 'span-4',
        parentSpanId: 'span-3',
        functionName: 'callStripeAPI',
        durationNanos: 70_000_000,
        timestamp: '2026-09-29T10:00:00.040Z',
      }),
    ];

    await storage.insertBatch(spans);

    const traceTree = await storage.getTrace(traceId);
    expect(traceTree).not.toBeNull();
    expect(traceTree?.trace_id).toBe(traceId);
    expect(traceTree?.total_spans).toBe(4);
    expect(traceTree?.roots).toHaveLength(1);

    const root = traceTree!.roots[0];
    expect(root.span_id).toBe('span-1');
    expect(root.function_name).toBe('handleCheckout');
    expect(root.children).toHaveLength(2);

    const validateCartNode = root.children.find((c) => c.function_name === 'validateCart')!;
    expect(validateCartNode).toBeDefined();
    expect(validateCartNode.children).toHaveLength(0);

    const chargeCardNode = root.children.find((c) => c.function_name === 'chargeCard')!;
    expect(chargeCardNode).toBeDefined();
    expect(chargeCardNode.children).toHaveLength(1);

    const stripeNode = chargeCardNode.children[0];
    expect(stripeNode.span_id).toBe('span-4');
    expect(stripeNode.function_name).toBe('callStripeAPI');

    storage.close();
  });

  it('computes execution stats with accurate p50, p95, p99 percentiles', async () => {
    const storage = new IndexedDBStorage({ dbName: 'test_eventslog_db' });

    // Insert 10 events with durations 10ms to 100ms
    const events: Event[] = [];
    for (let i = 1; i <= 10; i++) {
      events.push(
        makeMockEvent({
          eventId: `stat-${i}`,
          functionName: 'processItem',
          durationNanos: i * 10 * 1_000_000,
          status: i === 10 ? 'error' : 'success',
        })
      );
    }

    await storage.insertBatch(events);

    const stats = await storage.getStats('frontend-web', 'development');
    expect(stats.total_executions).toBe(10);
    expect(stats.total_errors).toBe(1);
    expect(stats.error_rate).toBeCloseTo(0.1);
    expect(stats.p50_duration_ms).toBeGreaterThanOrEqual(50);
    expect(stats.p95_duration_ms).toBeGreaterThanOrEqual(90);
    expect(stats.p99_duration_ms).toBe(100);

    // Clear storage
    await storage.clear();
    const afterClear = await storage.listExecutions();
    expect(afterClear).toHaveLength(0);

    storage.close();
  });

  it('integrates seamlessly with EventsLogBrowserClient in mode: local with zero external servers', async () => {
    const client = new EventsLogBrowserClient({
      serviceName: 'my-single-page-app',
      environment: 'local',
      mode: 'local', // In-browser local mode
      batchSize: 2,
    });

    // Trace synchronous function
    const result = client.startSpan('app.math.add', () => 40 + 2);
    expect(result).toBe(42);

    // Trace asynchronous function
    const asyncResult = await client.traceAsync('app.api.fetchConfig', async () => ({
      apiUrl: 'http://localhost:3000',
    }));
    expect(asyncResult.apiUrl).toBe('http://localhost:3000');

    // Flush batch to IndexedDB
    await client.flush();

    // Query storage directly without any backend server running
    const functions = await client.storage.listFunctions();
    expect(functions.length).toBeGreaterThanOrEqual(2);

    const addFn = functions.find((f) => f.function_name === 'add');
    expect(addFn).toBeDefined();
    expect(addFn?.call_count).toBe(1);

    const fetchConfigFn = functions.find((f) => f.function_name === 'fetchConfig');
    expect(fetchConfigFn).toBeDefined();
    expect(fetchConfigFn?.call_count).toBe(1);

    const executions = await client.storage.listExecutions();
    expect(executions.length).toBe(2);

    client.destroy();
  });
});
