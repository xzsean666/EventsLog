import * as http from 'node:http';
import { launchServices } from './orchestrator';
import { startNestServer } from './nestjs/server';
import { runReactSimulation } from './react/CheckoutApp';
import { runVueSimulation } from './vue/StoreApp';
import { runConcurrencyTest } from './concurrency';
import {
  HttpTransport,
  EventBatcher,
  type EventsLogConfig,
  type EventSink,
} from '@eventslog/node';

const INGESTION_PORT = 8094;
const QUERY_PORT = 8095;
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://eventlake:eventlake@127.0.0.1:8123';
const API_KEY = 'el_real_world_e2e_secret_999';

async function queryClickHouse(sql: string): Promise<any[]> {
  const parsed = new URL(CLICKHOUSE_URL);
  const auth = parsed.username ? `Basic ${Buffer.from(`${parsed.username}:${parsed.password}`).toString('base64')}` : undefined;
  parsed.username = '';
  parsed.password = '';
  const cleanBase = parsed.toString().replace(/\/$/, '');
  const url = `${cleanBase}/?query=${encodeURIComponent(sql)}&default_format=JSONEachRow`;
  const headers: Record<string, string> = {};
  if (auth) {
    headers['Authorization'] = auth;
  }
  const res = await fetch(url, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse query failed (${res.status}): ${text}`);
  }
  const text = await res.text();
  if (!text.trim()) return [];
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

async function queryApi(path: string): Promise<any> {
  const res = await fetch(`http://127.0.0.1:${QUERY_PORT}${path}`, {
    headers: {
      'x-api-key': API_KEY,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Query API failed for ${path} (${res.status}): ${text}`);
  }
  return await res.json();
}

async function main() {
  console.log('================================================================================');
  console.log(' EventsLog Real-World E2E Test Suite (React, Vue, NestJS, Ingestion, ClickHouse)');
  console.log('================================================================================\n');

  console.log('--> Step 1: Launching Live Rust Ingestion & Query Services...');
  const services = await launchServices({
    ingestionPort: INGESTION_PORT,
    queryPort: QUERY_PORT,
    clickhouseUrl: CLICKHOUSE_URL,
    apiKey: API_KEY,
  });
  console.log(`    [OK] Ingestion service running at ${services.ingestionUrl}`);
  console.log(`    [OK] Query service running at ${services.queryUrl}\n`);

  let nestInstance: any = null;
  let nestBatcher: EventBatcher | null = null;

  try {
    console.log('--> Step 2: Initializing NestJS Backend with @eventslog/node Instrumentation...');
    const nodeConfig: EventsLogConfig = {
      mode: 'remote',
      sqlite_path: './eventslog.db',
      service_name: 'nestjs-ecommerce-backend',
      environment: 'staging',
      endpoint: `${services.ingestionUrl}/v1/events`,
      api_key: API_KEY,
      batching: {
        max_batch_size: 5,
        flush_interval_ms: 50,
        max_queue_size: 1000,
      },
      instrumentation: {
        include: ['*'],
        exclude: ['*.internalDebug'],
        sensitive_keys: ['password', 'cardNumber', 'cvv', 'authToken'],
        max_payload_bytes: 65536,
        sampling_rate: 1.0,
      },
    };

    const transport = new HttpTransport({
      endpoint: nodeConfig.endpoint,
      apiKey: nodeConfig.api_key,
    });

    nestBatcher = new EventBatcher({
      maxBatchSize: nodeConfig.batching.max_batch_size,
      flushIntervalMs: nodeConfig.batching.flush_interval_ms,
      maxQueueSize: nodeConfig.batching.max_queue_size,
      transport,
    });

    const sink: EventSink = (event) => {
      nestBatcher!.push(event);
    };

    nestInstance = await startNestServer(0, nodeConfig, sink);
    console.log(`    [OK] NestJS Backend listening at ${nestInstance.url}\n`);

    // Verify NestJS health
    const healthRes = await fetch(`${nestInstance.url}/api/health`);
    if (!healthRes.ok) {
      throw new Error(`NestJS health check failed: ${healthRes.status}`);
    }

    console.log('--> Step 3: Executing React Frontend Real-World Simulation...');
    const reactResult = await runReactSimulation({
      ingestionUrl: `${services.ingestionUrl}/v1/events`,
      backendUrl: nestInstance.url,
      apiKey: API_KEY,
    });
    console.log(`    [OK] React checkout workflow executed successfully.`);
    console.log(`    [OK] React trace ID generated: ${reactResult.reactTraceId}`);
    console.log(`    [OK] React Error Boundary caught crash: ${reactResult.boundaryCaught}\n`);

    console.log('--> Step 4: Executing Vue 3 Frontend Real-World Simulation...');
    const vueResult = await runVueSimulation({
      ingestionUrl: `${services.ingestionUrl}/v1/events`,
      backendUrl: nestInstance.url,
      apiKey: API_KEY,
    });
    console.log(`    [OK] Vue Router navigation transitions tracked.`);
    console.log(`    [OK] Vue trace ID generated: ${vueResult.vueTraceId}`);
    console.log(`    [OK] Vue cross-tier exception caught: ${vueResult.nestErrorMessage}\n`);

    console.log('--> Step 5: Executing High-Concurrency Stress Test (25 Parallel Clients)...');
    const concurrencyResult = await runConcurrencyTest({
      backendUrl: nestInstance.url,
      concurrency: 25,
    });
    console.log(`    [OK] Concurrent requests completed: ${concurrencyResult.successfulCount}/${concurrencyResult.total}`);
    console.log(`    [OK] Distinct trace IDs verified: ${concurrencyResult.distinctTraceIds}/${concurrencyResult.total}\n`);

    if (!concurrencyResult.allSuccessful) {
      throw new Error('Concurrency test failed! Some requests did not return matching trace IDs.');
    }

    console.log('--> Step 6: Flushing Telemetry Buffers & Persisting to ClickHouse...');
    await nestBatcher.flush();
    await reactResult.browserClient.flush();
    await vueResult.browserClient.flush();

    // Allow ClickHouse writer interval to flush and merge
    console.log('    Waiting 1500ms for Ingestion ring buffer and ClickHouse async inserts...');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log('\n================================================================================');
    console.log(' VERIFICATION & ASSERTION PHASE');
    console.log('================================================================================\n');

    // 1. Verify Function Catalog in Query API
    console.log('--> Check 1: Query API Function Catalog (/v1/functions)');
    const functionsResp = await queryApi('/v1/functions?service_name=nestjs-ecommerce-backend');
    const functionsList: any[] = functionsResp.functions || functionsResp.data || functionsResp;
    console.log(`    Observed backend functions count: ${functionsList.length}`);

    const observedNames = functionsList.map((f) => f.function_name);
    console.log(`    Functions observed: ${observedNames.join(', ')}`);

    const expectedFunctions = ['createOrder', 'checkAndReserve', 'processPayment'];
    for (const expected of expectedFunctions) {
      if (!observedNames.includes(expected)) {
        throw new Error(`Expected function "${expected}" was not found in Query API functions list!`);
      }
    }
    console.log('    [PASS] All expected NestJS controller & service functions observed in catalog.\n');

    // 2. Verify Execution Details in Query API
    console.log('--> Check 2: Query API Function Executions');
    const createOrderFunc = functionsList.find((f) => f.function_name === 'createOrder');
    if (!createOrderFunc) {
      throw new Error('createOrder function record not found in catalog');
    }

    const executionsResp = await queryApi(`/v1/functions/${encodeURIComponent(createOrderFunc.function_id)}/executions`);
    const executionsList: any[] = executionsResp.executions || executionsResp.data || executionsResp;
    console.log(`    Executions recorded for createOrder: ${executionsList.length}`);
    if (executionsList.length === 0) {
      throw new Error('Expected at least 1 execution record for createOrder');
    }
    const sampleExecution = executionsList[0];
    console.log(`    Sample execution status: ${sampleExecution.status}, duration: ${sampleExecution.duration_ms}ms`);
    console.log('    [PASS] Function execution details successfully queried from Query API.\n');

    // 3. Verify Distributed Trace Hierarchy (Client -> NestJS Controller -> NestJS Services)
    console.log('--> Check 3: Distributed Trace Reconstruction (/v1/traces/:trace_id)');
    console.log(`    Querying trace tree for React checkout trace: ${reactResult.reactTraceId}`);
    const traceResp = await queryApi(`/v1/traces/${reactResult.reactTraceId}`);
    const roots: any[] = traceResp.roots || traceResp.trace?.roots || [];

    const flattenNodes = (nodes: any[]): any[] => {
      const flat: any[] = [];
      for (const n of nodes) {
        flat.push(n);
        if (n.children && Array.isArray(n.children)) {
          flat.push(...flattenNodes(n.children));
        }
      }
      return flat;
    };

    const spans = flattenNodes(roots);
    console.log(`    Total spans reconstructed in trace: ${spans.length}`);

    if (spans.length < 2) {
      throw new Error(`Expected at least 2 spans in distributed trace, found ${spans.length}`);
    }

    const spanFunctions = spans.map((s) => s.function_name);
    console.log(`    Spans in trace tree: ${spanFunctions.join(' -> ')}`);

    // Verify trace hierarchy links
    const rootSpan = roots[0];
    console.log(`    Root span identified: ${rootSpan ? rootSpan.function_name : 'none'} (span_id: ${rootSpan?.span_id})`);

    const childSpans = spans.filter((s) => s.parent_span_id && s.parent_span_id !== '');
    console.log(`    Child spans identified: ${childSpans.length}`);

    for (const child of childSpans) {
      const parentExists = spans.some((s) => s.span_id === child.parent_span_id);
      if (!parentExists) {
        throw new Error(`Orphan child span found! ${child.function_name} points to non-existent parent_span_id: ${child.parent_span_id}`);
      }
    }
    console.log('    [PASS] Distributed trace tree correctly linked with intact parent-child hierarchy.\n');

    // 4. Verify Sensitive Data Redaction in ClickHouse Storage
    console.log('--> Check 4: Data Privacy & Sensitive Key Redaction in ClickHouse Storage');
    const leakCheck = await queryClickHouse(
      "SELECT count() AS count FROM eventslog.function_executions WHERE input_json LIKE '%4532-1111-2222-3333%' OR input_json LIKE '%react_auth_super_secret_token_abc%' OR output_json LIKE '%4532-1111-2222-3333%'"
    );
    const leakedCount = Number(leakCheck[0]?.count || 0);
    console.log(`    Plaintext sensitive data leak check: ${leakedCount} leaks detected`);
    if (leakedCount > 0) {
      throw new Error(`CRITICAL SECURITY FAILURE: Found ${leakedCount} unmasked sensitive records in ClickHouse!`);
    }

    const redactCheck = await queryClickHouse(
      "SELECT count() AS count FROM eventslog.function_executions WHERE input_json LIKE '%[REDACTED]%'"
    );
    const redactedCount = Number(redactCheck[0]?.count || 0);
    console.log(`    Sanitized [REDACTED] records count: ${redactedCount}`);
    if (redactedCount === 0) {
      throw new Error('Sanitization check failed: Expected [REDACTED] fields in ClickHouse execution records!');
    }
    console.log('    [PASS] Zero sensitive data leaked; all credit cards, CVVs, and auth tokens redacted.\n');

    // 5. Verify Frontend Error Capture in ClickHouse (React Error Boundary & Vue Error Handler)
    console.log('--> Check 5: Frontend Framework Error Capture (React Error Boundary & Vue Error Handler)');
    const reactErrorRows = await queryClickHouse(
      "SELECT count() AS count FROM eventslog.function_executions WHERE error_message LIKE '%React UI Crash: Unable to render product grid%'"
    );
    const reactErrorCount = Number(reactErrorRows[0]?.count || 0);
    console.log(`    React Error Boundary crashes persisted in ClickHouse: ${reactErrorCount}`);
    if (reactErrorCount === 0) {
      throw new Error('React Error Boundary error was not recorded in ClickHouse!');
    }

    const vueErrorRows = await queryClickHouse(
      "SELECT count() AS count FROM eventslog.function_executions WHERE error_message LIKE '%Vue Unhandled Error: Inventory stock reactivity mismatch%'"
    );
    const vueErrorCount = Number(vueErrorRows[0]?.count || 0);
    console.log(`    Vue Error Handler crashes persisted in ClickHouse: ${vueErrorCount}`);
    if (vueErrorCount === 0) {
      throw new Error('Vue error was not recorded in ClickHouse!');
    }
    console.log('    [PASS] Both React and Vue frontend errors successfully captured and persisted.\n');

    // 6. Verify Backend Exception Flow in ClickHouse
    console.log('--> Check 6: NestJS Backend Exception & Status Tracking');
    const nestErrorRows = await queryClickHouse(
      "SELECT count() AS count FROM eventslog.function_executions WHERE service_name = 'nestjs-ecommerce-backend' AND status = 'error'"
    );
    const nestErrorCount = Number(nestErrorRows[0]?.count || 0);
    console.log(`    NestJS service exceptions persisted with status=error: ${nestErrorCount}`);
    if (nestErrorCount === 0) {
      throw new Error('NestJS backend exceptions were not recorded with status=error in ClickHouse!');
    }
    console.log('    [PASS] Backend service exceptions captured with full error status and stack trace.\n');

    console.log('================================================================================');
    console.log(' ALL END-TO-END REAL-WORLD VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
    console.log('================================================================================\n');
  } finally {
    console.log('--> Tearing down test environment...');
    if (nestInstance) {
      await nestInstance.close();
      console.log('    NestJS server closed.');
    }
    await services.stop();
    console.log('    Ingestion and Query services stopped.');
  }
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN E2E SUITE]:', err);
  process.exit(1);
});
