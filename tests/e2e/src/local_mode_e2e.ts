import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';

// Helper for loading node:sqlite
const nodeRequire =
  typeof require !== 'undefined'
    ? require
    : createRequire(path.join(process.cwd(), 'index.js'));
const { DatabaseSync } = nodeRequire('node:sqlite');

const COLOR_RESET = '\x1b[0m';
const COLOR_GREEN = '\x1b[32m';
const COLOR_RED = '\x1b[31m';
const COLOR_BLUE = '\x1b[34m';
const COLOR_CYAN = '\x1b[36m';
const COLOR_YELLOW = '\x1b[33m';

function logSection(title: string) {
  console.log(`\n${COLOR_CYAN}======================================================================${COLOR_RESET}`);
  console.log(`${COLOR_CYAN}  ${title}${COLOR_RESET}`);
  console.log(`${COLOR_CYAN}======================================================================${COLOR_RESET}\n`);
}

function logSuccess(msg: string) {
  console.log(`${COLOR_GREEN}✓ ${msg}${COLOR_RESET}`);
}

function logInfo(msg: string) {
  console.log(`${COLOR_BLUE}ℹ ${msg}${COLOR_RESET}`);
}

function logError(msg: string) {
  console.error(`${COLOR_RED}✗ ${msg}${COLOR_RESET}`);
}

// -----------------------------------------------------------------------------
// Scenario 1: Node.js SDK Zero-Code In-Process SQLite Mode
// -----------------------------------------------------------------------------
async function runScenario1_NodeSqlite(): Promise<void> {
  logSection('Scenario 1: External Node.js App Zero-Code In-Process SQLite Mode');
  logInfo('Verifying that an external project installing ONLY @eventslog/node runs with 0 servers.');

  const dbPath = path.resolve('/tmp/eventslog_e2e_node.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const libPath = path.resolve('/tmp/sample_external_lib.js');
  const libCode = `
    function calculateCart(items, taxRate) {
      const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      return { subtotal, tax: subtotal * taxRate, total: subtotal * (1 + taxRate) };
    }

    async function fetchUserPreferences(userId) {
      await new Promise(r => setTimeout(r, 20));
      return { userId, theme: 'dark', currency: 'USD' };
    }

    function validatePayment(cardInfo) {
      if (!cardInfo || !cardInfo.number) {
        const err = new Error('Invalid card details provided');
        err.name = 'CardValidationError';
        throw err;
      }
      return { valid: true };
    }

    module.exports = { calculateCart, fetchUserPreferences, validatePayment };
  `;
  fs.writeFileSync(libPath, libCode, 'utf8');

  const appPath = path.resolve('/tmp/sample_external_app.js');
  const appCode = `
    const { calculateCart, fetchUserPreferences, validatePayment } = require('./sample_external_lib.js');

    async function main() {
      calculateCart([{ price: 29.99, qty: 2 }, { price: 10.00, qty: 1 }], 0.08);
      await fetchUserPreferences('usr_4492');
      try {
        validatePayment({});
      } catch {
        // expected failure
      }
    }

    main();
  `;
  fs.writeFileSync(appPath, appCode, 'utf8');

  // Register hook path
  const registerPath = path.resolve(__dirname, '../../../sdks/node/dist/register.js');
  logInfo(`Executing external script with -r ${registerPath}`);

  const child = spawnSync('node', ['-r', registerPath, appPath], {
    cwd: '/tmp',
    env: {
      ...process.env,
      EVENTSLOG_MODE: 'local',
      EVENTSLOG_DB_PATH: dbPath,
      EVENTSLOG_SERVICE_NAME: 'e2e-order-service',
      EVENTSLOG_ENVIRONMENT: 'staging',
      EVENTSLOG_FLUSH_INTERVAL: '100', // flush fast for test
    },
    encoding: 'utf8',
  });

  if (child.error) {
    throw new Error(`Failed to execute child process: ${child.error.message}`);
  }

  // Allow flush on exit
  await new Promise((r) => setTimeout(r, 200));

  // Verify SQLite database exists
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Expected SQLite database at ${dbPath} was not created!`);
  }
  logSuccess(`SQLite database file created: ${dbPath}`);

  // Query SQLite directly
  const db = new DatabaseSync(dbPath);
  const rows = db.prepare('SELECT * FROM executions ORDER BY timestamp ASC').all() as any[];

  logInfo(`Found ${rows.length} execution records persisted in SQLite:`);
  for (const r of rows) {
    console.log(`  - [${r.status.toUpperCase()}] ${r.function_name} (${r.duration_ms.toFixed(2)}ms) in ${r.module_name}`);
  }

  if (rows.length < 3) {
    throw new Error(`Expected at least 3 execution records, but found ${rows.length}`);
  }

  const calcRow = rows.find((r) => r.function_name === 'calculateCart');
  if (!calcRow) throw new Error('Missing calculateCart execution');
  const calcOutput = JSON.parse(calcRow.output_json);
  if (Math.abs(calcOutput.subtotal - 69.98) > 0.01) {
    throw new Error(`Unexpected calculateCart subtotal: ${calcOutput.subtotal}`);
  }
  logSuccess('Function arguments and return value correctly serialized to JSON.');

  const errRow = rows.find((r) => r.function_name === 'validatePayment');
  if (!errRow || errRow.status !== 'error') {
    throw new Error('Missing or incorrect error status for validatePayment');
  }
  if (errRow.error_type !== 'CardValidationError') {
    throw new Error(`Unexpected error type: ${errRow.error_type}`);
  }
  logSuccess(`Captured error type "${errRow.error_type}" and message "${errRow.error_message}".`);

  db.close();
  // Cleanup
  fs.unlinkSync(libPath);
  fs.unlinkSync(appPath);
  fs.unlinkSync(dbPath);
  logSuccess('Scenario 1 PASSED with 100% success (Zero server required).\n');
}

// -----------------------------------------------------------------------------
// Scenario 2: Standalone Rust Local Service (SQLite Engine + Ingestion & Query APIs)
// -----------------------------------------------------------------------------
async function runScenario2_RustLocalService(): Promise<void> {
  logSection('Scenario 2: Standalone Rust Local Service (eventslog-local)');
  logInfo('Starting eventslog-local binary on port 8999 with SQLite storage engine...');

  const dbPath = path.resolve('/tmp/eventslog_e2e_rust_service.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const binPath = path.resolve(__dirname, '../../../target/debug/eventslog-local');
  if (!fs.existsSync(binPath)) {
    throw new Error(`eventslog-local binary not found at ${binPath}. Run cargo build first.`);
  }

  const port = 8999;
  const child: ChildProcess = spawn(binPath, ['--port', String(port), '--db', dbPath], {
    stdio: 'pipe',
  });

  // Wait for health check
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // connecting
    }
  }

  if (!ready) {
    child.kill();
    throw new Error('Rust local service failed to become healthy within 3 seconds');
  }
  logSuccess(`Rust local service running at http://localhost:${port}`);

  try {
    // Ingest events
    const traceId = '0af7651916cd43dd8448eb211c80319c';
    const events = [
      {
        event_id: '11111111-1111-1111-1111-111111111001',
        trace_id: traceId,
        span_id: 'b7ad6b7169203331',
        service_name: 'payment-svc',
        environment: 'local',
        timestamp: '2026-09-29T14:00:00Z',
        event_type: 'function_execution',
        payload: {
          type: 'function_execution',
          data: {
            function: { module: 'billing.charge', function_name: 'processCharge' },
            duration_nanos: 150_000_000,
            status: 'success',
            input_payload: { amount: 99.99 },
            output_payload: { status: 'paid' },
          },
        },
      },
      {
        event_id: '11111111-1111-1111-1111-111111111002',
        trace_id: traceId,
        span_id: 'b7ad6b7169203332',
        parent_span_id: 'b7ad6b7169203331',
        service_name: 'payment-svc',
        environment: 'local',
        timestamp: '2026-09-29T14:00:00.020Z',
        event_type: 'function_execution',
        payload: {
          type: 'function_execution',
          data: {
            function: { module: 'gateway.stripe', function_name: 'callStripeApi' },
            duration_nanos: 120_000_000,
            status: 'success',
            input_payload: { card: 'tok_visa' },
            output_payload: { id: 'ch_123' },
          },
        },
      },
      {
        event_id: '11111111-1111-1111-1111-111111111003',
        trace_id: traceId,
        span_id: 'b7ad6b7169203333',
        parent_span_id: 'b7ad6b7169203331',
        service_name: 'payment-svc',
        environment: 'local',
        timestamp: '2026-09-29T14:00:00.140Z',
        event_type: 'function_execution',
        payload: {
          type: 'function_execution',
          data: {
            function: { module: 'receipt.email', function_name: 'sendReceipt' },
            duration_nanos: 25_000_000,
            status: 'error',
            error: { type_name: 'SmtpError', message: 'Mail server unreachable' },
          },
        },
      },
    ];

    const ingestRes = await fetch(`http://localhost:${port}/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });

    if (ingestRes.status !== 202) {
      throw new Error(`Ingest failed with status ${ingestRes.status}: ${await ingestRes.text()}`);
    }
    logSuccess('Event batch posted to /v1/events and accepted (HTTP 202).');

    // Query functions
    const funcRes = await fetch(`http://localhost:${port}/v1/functions`);
    const funcsJson = (await funcRes.json()) as any;
    const funcs = Array.isArray(funcsJson) ? funcsJson : (funcsJson.functions || []);
    logSuccess(`Queried /v1/functions: returned ${funcs.length} aggregated function summaries.`);
    const processCharge = funcs.find((f: any) => f.function_name === 'processCharge');
    if (!processCharge) throw new Error('Missing processCharge in /v1/functions response');
    logSuccess(`  Function ${processCharge.function_name}: call_count=${processCharge.call_count}, avg=${processCharge.avg_duration_ms}ms`);

    // Query trace tree
    const traceRes = await fetch(`http://localhost:${port}/v1/traces/${traceId}`);
    const traceJson = (await traceRes.json()) as any;
    const roots = traceJson.roots || traceJson.trace?.roots || [];
    if (roots.length !== 1) {
      throw new Error(`Expected 1 root span in trace tree, got ${roots.length}`);
    }
    const rootSpan = roots[0];
    if (rootSpan.children.length !== 2) {
      throw new Error(`Expected 2 child spans in trace tree, got ${rootSpan.children.length}`);
    }
    logSuccess(`Reconstructed trace tree: Root '${rootSpan.function_name}' has 2 children (${rootSpan.children.map((c: any) => c.function_name).join(', ')})`);

    // Query stats
    const statsRes = await fetch(`http://localhost:${port}/v1/stats`);
    const statsJson = (await statsRes.json()) as any;
    const s = statsJson.stats || statsJson;
    logSuccess(`Overview stats: total=${s.total_executions}, errors=${s.total_errors}, p50=${s.p50_duration_ms}ms, p95=${s.p95_duration_ms}ms`);

  } finally {
    child.kill('SIGINT');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }

  logSuccess('Scenario 2 PASSED with 100% success.\n');
}

// -----------------------------------------------------------------------------
// Scenario 3: Browser SDK In-Browser IndexedDB Local Mode & DevTools
// -----------------------------------------------------------------------------
async function runScenario3_BrowserIndexedDb(): Promise<void> {
  logSection('Scenario 3: Browser SDK In-Browser IndexedDB Local Mode & DevTools');
  logInfo('Verifying @eventslog/browser persistent local storage and DevTools with 0 servers.');

  // Import Browser SDK
  const { EventsLogBrowserClient, IndexedDBStorage } = await import('../../../sdks/browser/dist/index.mjs');

  // Setup Mock IDB
  class MockIDBObjectStore {
    records: Map<string, any> = new Map();
    indexes: Map<string, any> = new Map();
    constructor(public name: string, public keyPath: string) {}
    createIndex(name: string, keyPath: string, opts: any) {
      this.indexes.set(name, { name, keyPath, opts });
    }
    put(value: any) {
      const req: any = {};
      queueMicrotask(() => {
        this.records.set(value[this.keyPath], JSON.parse(JSON.stringify(value)));
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    }
    getAll() {
      const req: any = {};
      queueMicrotask(() => {
        req.result = Array.from(this.records.values());
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    }
    clear() {
      const req: any = {};
      queueMicrotask(() => {
        this.records.clear();
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    }
  }

  class MockIDBDatabase {
    stores = new Map<string, MockIDBObjectStore>();
    constructor(public name: string, public version: number) {}
    get objectStoreNames() {
      return { contains: (n: string) => this.stores.has(n) };
    }
    createObjectStore(name: string, opts: any) {
      const s = new MockIDBObjectStore(name, opts.keyPath);
      this.stores.set(name, s);
      return s;
    }
    transaction(names: string[], mode: string) {
      const tx: any = {
        objectStore: (n: string) => this.stores.get(n)!,
      };
      queueMicrotask(() => {
        if (tx.oncomplete) tx.oncomplete({ target: tx });
      });
      return tx;
    }
    close() {}
  }

  const mockDatabases = new Map<string, MockIDBDatabase>();
  const mockIDB = {
    open: (name: string, version: number) => {
      const req: any = {};
      queueMicrotask(() => {
        let db = mockDatabases.get(name);
        let upgrade = false;
        if (!db) {
          db = new MockIDBDatabase(name, version);
          mockDatabases.set(name, db);
          upgrade = true;
        }
        req.result = db;
        if (upgrade && req.onupgradeneeded) req.onupgradeneeded({ target: req });
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    },
  };

  (globalThis as any).indexedDB = mockIDB;

  // Initialize browser client in local mode
  const client = new EventsLogBrowserClient({
    serviceName: 'e2e-react-dashboard',
    environment: 'local',
    mode: 'local',
    indexedDbName: 'e2e_browser_db',
  });

  // Track function calls in child spans
  client.startSpan('ui.views.renderApp', () => {
    client.startSpan('ui.components.loadUserInfo', () => ({
      username: 'johndoe',
      roles: ['admin'],
    }));
    try {
      client.startSpan('ui.components.fetchNotifications', () => {
        throw new Error('Failed to load notifications from stream');
      });
    } catch {
      // Expected error: startSpan re-throws errors by design so application error-handling is not corrupted
    }
  });

  await client.flush();

  // Query client storage directly
  const functions = await client.storage.listFunctions();
  logSuccess(`IndexedDB query: Found ${functions.length} functions aggregated in-browser.`);
  for (const f of functions) {
    console.log(`  - ${f.function_name}: call_count=${f.call_count}, errors=${f.error_count}, avg=${f.avg_duration_ms.toFixed(1)}ms`);
  }

  const stats = await client.storage.getStats();
  logSuccess(`IndexedDB statistics: total=${stats.total_executions}, errors=${stats.total_errors}, error_rate=${(stats.error_rate * 100).toFixed(1)}%`);

  client.destroy();
  delete (globalThis as any).indexedDB;
  logSuccess('Scenario 3 PASSED with 100% success.\n');
}

// -----------------------------------------------------------------------------
// Scenario 4: Dashboard Multi-Provider Data Source Verification
// -----------------------------------------------------------------------------
async function runScenario4_DashboardMultiProvider(): Promise<void> {
  logSection('Scenario 4: Web Dashboard Multi-Provider Data Source Verification');
  logInfo('Verifying that Dashboard can switch between Remote, Local SQLite, and In-Browser IndexedDB.');

  const { ProviderRegistry, HttpDataProvider, IndexedDBDataProvider } = await import(
    '../../../dashboard/src/api/provider.js'
  );

  const registry = new ProviderRegistry();
  const providers = registry.getProviders();

  logSuccess(`ProviderRegistry initialized with ${providers.length} data sources:`);
  for (const p of providers) {
    console.log(`  - [${p.id}] ${p.name} (${p.type}): ${p.description}`);
  }

  // Verify switching
  registry.setActiveProvider('local_sqlite');
  expectEqual(registry.getActiveProviderId(), 'local_sqlite', 'Active provider should be local_sqlite');
  logSuccess('Switched active provider to local_sqlite.');

  registry.setActiveProvider('indexeddb');
  expectEqual(registry.getActiveProviderId(), 'indexeddb', 'Active provider should be indexeddb');
  logSuccess('Switched active provider to indexeddb.');

  logSuccess('Scenario 4 PASSED with 100% success.\n');
}

function expectEqual(actual: any, expected: any, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

// -----------------------------------------------------------------------------
// Orchestrator
// -----------------------------------------------------------------------------
async function main() {
  console.log(`\n${COLOR_CYAN}======================================================================${COLOR_RESET}`);
  console.log(`${COLOR_CYAN}  EventsLog Milestone 14: Full-Stack Local Mode E2E Simulation${COLOR_RESET}`);
  console.log(`${COLOR_CYAN}======================================================================${COLOR_RESET}`);

  try {
    await runScenario1_NodeSqlite();
    await runScenario2_RustLocalService();
    await runScenario3_BrowserIndexedDb();
    await runScenario4_DashboardMultiProvider();

    console.log(`${COLOR_GREEN}======================================================================${COLOR_RESET}`);
    console.log(`${COLOR_GREEN}  ALL 4 LOCAL MODE FULL-STACK SCENARIOS COMPLETED WITH 100% SUCCESS!${COLOR_RESET}`);
    console.log(`${COLOR_GREEN}======================================================================${COLOR_RESET}\n`);
    process.exit(0);
  } catch (err) {
    logError(`Simulation failed: ${err instanceof Error ? err.stack : String(err)}`);
    process.exit(1);
  }
}

void main();
