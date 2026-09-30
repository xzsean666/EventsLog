import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HttpDataProvider,
  IndexedDBDataProvider,
  ProviderRegistry,
} from '../src/api/provider.js';

// In-Memory IDB Mock Implementation for Node/Vitest tests
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

  getAll(): IDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      req.result = Array.from(this.records.values()).map((v) => JSON.parse(JSON.stringify(v)));
      if (req.onsuccess) req.onsuccess({ target: req } as any);
    });
    return req as unknown as IDBRequest;
  }
}

class MockIDBTransaction {
  storeNames: string[];
  mode: string;
  db: MockIDBDatabase;

  constructor(db: MockIDBDatabase, storeNames: string[], mode: string) {
    this.db = db;
    this.storeNames = storeNames;
    this.mode = mode;
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
}

class MockIDBRequest {
  result: any = null;
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

describe('Dashboard Multi-Provider Data Sources', () => {
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

  describe('HttpDataProvider', () => {
    it('initializes with metadata and uses fallback data when offline', async () => {
      const provider = new HttpDataProvider({
        id: 'remote-test',
        name: 'Test Remote',
        type: 'http_remote',
        description: 'Test remote provider',
        baseUrl: 'http://127.0.0.1:54321',
        enableFallback: true,
      });

      expect(provider.id).toBe('remote-test');
      expect(provider.type).toBe('http_remote');

      const stats = await provider.fetchStats();
      expect(stats.total_executions).toBeGreaterThan(0);

      const funcs = await provider.fetchFunctions();
      expect(funcs.length).toBeGreaterThan(0);
    });

    it('returns false for isAvailable when service is unreachable', async () => {
      const provider = new HttpDataProvider({
        id: 'local-test',
        name: 'Local Test',
        type: 'http_local',
        description: 'Test local',
        baseUrl: 'http://127.0.0.1:59999',
      });

      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('IndexedDBDataProvider', () => {
    it('detects availability when indexedDB is present', async () => {
      const provider = new IndexedDBDataProvider({ dbName: 'test_db' });
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('queries telemetry statistics, functions, and traces directly from IndexedDB without network requests', async () => {
      const provider = new IndexedDBDataProvider({ dbName: 'eventslog_test_db' });

      // Pre-populate mock database
      const dbReq = mockIDB.open('eventslog_test_db', 1);
      await new Promise<void>((resolve) => {
        dbReq.onsuccess = (e) => {
          const db = (e.target as any).result as MockIDBDatabase;
          const store = db.createObjectStore('executions', { keyPath: 'event_id' });

          store.put({
            event_id: 'e1',
            trace_id: 'tr-100',
            span_id: 'sp-1',
            parent_span_id: '',
            service_name: 'browser-app',
            module_name: 'src.auth',
            class_name: 'AuthModal',
            function_name: 'submitLogin',
            duration_ms: 45.0,
            status: 'success',
            input_json: JSON.stringify({ user: 'alice' }),
            output_json: JSON.stringify({ token: 'jwt-xyz' }),
            timestamp: '2026-09-29T12:00:00Z',
          });

          store.put({
            event_id: 'e2',
            trace_id: 'tr-100',
            span_id: 'sp-2',
            parent_span_id: 'sp-1',
            service_name: 'browser-app',
            module_name: 'src.api',
            function_name: 'postCredentials',
            duration_ms: 30.0,
            status: 'success',
            timestamp: '2026-09-29T12:00:01Z',
          });

          store.put({
            event_id: 'e3',
            trace_id: 'tr-200',
            span_id: 'sp-3',
            parent_span_id: '',
            service_name: 'browser-app',
            module_name: 'src.cart',
            function_name: 'checkout',
            duration_ms: 120.0,
            status: 'error',
            error_type: 'TimeoutError',
            error_message: 'Gateway timeout',
            timestamp: '2026-09-29T12:05:00Z',
          });

          resolve();
        };
      });

      // 1. Stats query
      const stats = await provider.fetchStats();
      expect(stats.total_executions).toBe(3);
      expect(stats.total_errors).toBe(1);
      expect(stats.error_rate).toBeCloseTo(1 / 3);
      expect(stats.p50_duration_ms).toBe(45);
      expect(stats.p99_duration_ms).toBe(120);

      // 2. Functions query
      const funcs = await provider.fetchFunctions();
      expect(funcs).toHaveLength(3);

      const submitLogin = funcs.find((f) => f.function_name === 'submitLogin')!;
      expect(submitLogin).toBeDefined();
      expect(submitLogin.class_name).toBe('AuthModal');
      expect(submitLogin.total_executions).toBe(1);
      expect(submitLogin.avg_duration_ms).toBe(45);

      // 3. Execution query
      const exec = await provider.fetchExecution('e1');
      expect(exec.execution_id).toBe('e1');
      expect(exec.function_name).toBe('submitLogin');
      expect(exec.input_payload).toEqual({ user: 'alice' });
      expect(exec.output_payload).toEqual({ token: 'jwt-xyz' });

      // 4. Trace tree query
      const trace = await provider.fetchTrace('tr-100');
      expect(trace.trace_id).toBe('tr-100');
      expect(trace.total_spans).toBe(2);
      expect(trace.root_spans).toHaveLength(1);
      expect(trace.root_spans[0].function_name).toBe('submitLogin');
      expect(trace.root_spans[0].children).toHaveLength(1);
      expect(trace.root_spans[0].children[0].function_name).toBe('postCredentials');
    });
  });

  describe('ProviderRegistry', () => {
    it('registers default providers and switches active provider', () => {
      const registry = new ProviderRegistry();
      const providers = registry.getProviders();

      expect(providers.length).toBeGreaterThanOrEqual(3);
      expect(providers.some((p) => p.id === 'remote')).toBe(true);
      expect(providers.some((p) => p.id === 'local_sqlite')).toBe(true);
      expect(providers.some((p) => p.id === 'indexeddb')).toBe(true);

      expect(registry.getActiveProviderId()).toBe('remote');
      expect(registry.getActiveProvider().id).toBe('remote');

      const switched = registry.setActiveProvider('indexeddb');
      expect(switched).toBe(true);
      expect(registry.getActiveProviderId()).toBe('indexeddb');
      expect(registry.getActiveProvider().type).toBe('indexeddb');

      const invalid = registry.setActiveProvider('non-existent');
      expect(invalid).toBe(false);
      expect(registry.getActiveProviderId()).toBe('indexeddb');
    });
  });
});
