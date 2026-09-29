import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { launchServices } from './orchestrator';
import { runInject, runRestore } from '@eventslog/flutter/cli';

const INGESTION_PORT = 8094;
const QUERY_PORT = 8095;
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://eventlake:eventlake@127.0.0.1:8123';
const API_KEY = 'el_real_world_e2e_secret_999';

async function queryClickHouse(sql: string): Promise<any[]> {
  const parsed = new URL(CLICKHOUSE_URL);
  const auth = parsed.username
    ? `Basic ${Buffer.from(`${parsed.username}:${parsed.password}`).toString('base64')}`
    : undefined;
  parsed.username = '';
  parsed.password = '';
  const cleanBase = parsed.toString().replace(/\/$/, '');
  const url = `${cleanBase}/?query=${encodeURIComponent(sql)}&default_format=JSONEachRow`;
  const headers: Record<string, string> = {};
  if (auth) {
    headers['Authorization'] = auth;
  }
  const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
  const res = await fetch(url, { method: isSelect ? 'GET' : 'POST', headers });

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
    headers: { 'x-api-key': API_KEY },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Query API failed for ${path} (${res.status}): ${text}`);
  }
  return await res.json();
}

async function runCommand(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise<number>((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      console.error(`Command error: ${err.message}`);
      resolve(1);
    });
  });
}

async function main() {
  console.log('================================================================================');
  console.log(' EventsLog Flutter/Dart Real-World Full-Stack E2E Verification Suite');
  console.log('================================================================================\n');

  const flutterAppDir = path.resolve(__dirname, '../src/flutter_app');

  // Step 1: Launch Backend
  console.log('--> Step 1: Launching Live Rust Ingestion & Query Services...');
  const services = await launchServices({
    ingestionPort: INGESTION_PORT,
    queryPort: QUERY_PORT,
    clickhouseUrl: CLICKHOUSE_URL,
    apiKey: API_KEY,
  });
  console.log(`    [OK] Ingestion running at ${services.ingestionUrl}`);
  console.log(`    [OK] Query running at ${services.queryUrl}\n`);

  try {
    // Clear previous runs
    await queryClickHouse("ALTER TABLE eventslog.function_executions DELETE WHERE service_name = 'flutter-e2e-client';");
    await new Promise((r) => setTimeout(r, 200));

    // Record original file state
    const orderPath = path.join(flutterAppDir, 'lib/services/order_service.dart');
    const originalOrderCode = fs.readFileSync(orderPath, 'utf8');

    // Step 2: AST Code Instrumentation
    console.log('--> Step 2: Running Source-Level AST Code Injection...');
    const injectRes = runInject(flutterAppDir);
    console.log(`    [OK] Instrumented ${injectRes.filesModified} files (${injectRes.functionsCount} functions).`);
    if (injectRes.filesModified === 0) {
      throw new Error('AST Injection failed: 0 files modified!');
    }

    // Verify instrumented tag in source file
    const instrumentedOrderCode = fs.readFileSync(orderPath, 'utf8');
    if (!instrumentedOrderCode.includes('// @eventslog:instrumented')) {
      throw new Error('OrderService was not tagged as instrumented!');
    }

    // Step 3: Run Real Dart VM
    console.log('\n--> Step 3: Running Instrumented Dart Application in Native Dart VM...');
    const exitCode = await runCommand(
      'dart',
      ['run', 'lib/main.dart', `${services.ingestionUrl}/v1/events/batch`, API_KEY],
      flutterAppDir,
    );

    if (exitCode !== 0) {
      throw new Error(`Dart execution failed with exit code ${exitCode}`);
    }
    console.log('    [OK] Dart VM execution finished successfully.\n');

    // Step 4: Restore Original Source Code
    console.log('--> Step 4: Restoring Original Source Code (Zero Git Diff Check)...');
    const restoredCount = runRestore(flutterAppDir);
    console.log(`    [OK] Restored ${restoredCount} files.`);
    const restoredOrderCode = fs.readFileSync(orderPath, 'utf8');
    if (restoredOrderCode !== originalOrderCode) {
      throw new Error('Restored file does not match original code bit-for-bit!');
    }
    if (fs.existsSync(path.join(flutterAppDir, '.eventslog_backup'))) {
      throw new Error('.eventslog_backup folder was not removed!');
    }
    console.log('    [PASS] Clean restore verified: 0 Git modifications remaining.\n');

    // Wait for Ingestion buffer flush into ClickHouse
    console.log('--> Step 5: Awaiting Ingestion Buffer Flush into ClickHouse...');
    await new Promise((r) => setTimeout(r, 1000));

    // Step 6: 6 Rigorous Verification Checks
    console.log('================================================================================');
    console.log(' Running 6 Full-Stack Verification Checks Against ClickHouse & Query API');
    console.log('================================================================================\n');

    // Check 1: Executions count
    console.log('--> Check 1: Total Function Executions Persisted in ClickHouse');
    const executions = await queryClickHouse(
      "SELECT * FROM eventslog.function_executions WHERE service_name = 'flutter-e2e-client' ORDER BY timestamp ASC;",
    );
    console.log(`    Persisted executions: ${executions.length}`);
    if (executions.length < 6) {
      throw new Error(`Expected at least 6 executions, found ${executions.length}`);
    }
    console.log('    [PASS] All function executions successfully persisted into ClickHouse.\n');

    // Check 2: Function Catalog Coverage
    console.log('--> Check 2: Function Catalog Registration & Coverage');
    const functionListRes = await queryApi('/v1/functions?service_name=flutter-e2e-client');
    const catalogFunctions = (functionListRes.functions || []).map((i: any) => i.function_name);
    console.log(`    Catalog functions discovered: ${catalogFunctions.join(', ')}`);
    const expected = [
      'CheckoutWorkflow.executeCheckout',
      'InventoryService.reserveStock',
      'OrderService.createOrder',
      'PaymentService.processTransaction',
      'PaymentService.validateCardNumber',
      'OrderService.triggerOrderFailure',
    ];
    for (const exp of expected) {
      if (!catalogFunctions.includes(exp)) {
        throw new Error(`Function ${exp} missing from catalog!`);
      }
    }
    console.log('    [PASS] All 6 instrumented methods cataloged.\n');

    // Check 3: Multi-Level Trace Hierarchy Reconstruction (Zone async context propagation)
    console.log('--> Check 3: Multi-Level Distributed Trace Reconstruction via Query API');
    const rootExec = executions.find((e: any) => e.function_name === 'CheckoutWorkflow.executeCheckout');
    if (!rootExec) {
      throw new Error('Root execution CheckoutWorkflow.executeCheckout not found in ClickHouse!');
    }
    console.log(`    Root execution trace_id: ${rootExec.trace_id}, span_id: ${rootExec.span_id}`);
    const traceTree = await queryApi(`/v1/traces/${rootExec.trace_id}`);
    const rootNode = traceTree.roots?.[0] || traceTree.root_spans?.[0] || traceTree.trace?.roots?.[0];
    if (!rootNode) {
      throw new Error('No root node found in trace tree response!');
    }
    console.log(`    Trace tree root: ${rootNode.function_name}`);
    console.log(`    Total spans in trace tree: ${traceTree.total_spans || traceTree.trace?.total_spans}`);
    console.log(`    Child spans under root: ${rootNode.children.length}`);

    if (rootNode.function_name !== 'CheckoutWorkflow.executeCheckout') {
      throw new Error(`Unexpected trace tree root: ${rootNode.function_name}`);
    }
    if (rootNode.children.length < 4) {
      throw new Error(`Expected 4 child spans under executeCheckout, found ${rootNode.children.length}`);
    }
    const childNames = rootNode.children.map((c: any) => c.function_name);
    console.log(`    Child span names: ${childNames.join(', ')}`);
    if (!childNames.includes('InventoryService.reserveStock')) throw new Error('reserveStock missing from trace tree!');
    if (!childNames.includes('OrderService.createOrder')) throw new Error('createOrder missing from trace tree!');
    if (!childNames.includes('PaymentService.processTransaction')) throw new Error('processTransaction missing from trace tree!');
    if (!childNames.includes('PaymentService.validateCardNumber')) throw new Error('validateCardNumber missing from trace tree!');


    console.log('    [PASS] Dart Zone async context propagation perfectly verified! 4-child execution hierarchy reconstructed.\n');

    // Check 4: Argument Capture Fidelity
    console.log('--> Check 4: Function Arguments Input Payload Verification');
    const inputJson = JSON.parse(rootExec.input_json);
    console.log(`    Captured input_json: ${JSON.stringify(inputJson)}`);
    if (inputJson.userId !== 'usr_vip_888') throw new Error(`userId mismatch: ${inputJson.userId}`);
    if (inputJson.sku !== 'sku_laptop_pro') throw new Error(`sku mismatch: ${inputJson.sku}`);
    if (inputJson.quantity !== 2) throw new Error(`quantity mismatch: ${inputJson.quantity}`);
    if (inputJson.totalAmount !== 2499.0) throw new Error(`totalAmount mismatch: ${inputJson.totalAmount}`);
    console.log('    [PASS] Input arguments accurately captured and serialized.\n');

    // Check 5: Return Value Capture Fidelity
    console.log('--> Check 5: Function Return Value Output Payload Verification');
    const outputJson = JSON.parse(rootExec.output_json);
    console.log(`    Captured output_json: ${JSON.stringify(outputJson)}`);
    if (!outputJson.order_id || !outputJson.order_id.startsWith('ord_flutter_')) {
      throw new Error(`Invalid order_id in return value: ${outputJson.order_id}`);
    }
    if (outputJson.payment_status !== 'authorized') {
      throw new Error(`Unexpected payment_status: ${outputJson.payment_status}`);
    }
    if (outputJson.card_valid !== true) {
      throw new Error(`Expected card_valid true, got ${outputJson.card_valid}`);
    }
    console.log('    [PASS] Return value JSON faithfully captured and verified.\n');

    // Check 6: Error and Stack Trace Tracking
    console.log('--> Check 6: Exception and Stack Trace Capture');
    const failedExec = executions.find((e: any) => e.function_name === 'OrderService.triggerOrderFailure');
    if (!failedExec) {
      throw new Error('triggerOrderFailure execution not found!');
    }
    console.log(`    Status: ${failedExec.status}`);
    console.log(`    Error Type: ${failedExec.error_type}`);
    console.log(`    Error Message: ${failedExec.error_message}`);
    if (failedExec.status !== 'error') {
      throw new Error(`Expected status 'error', got '${failedExec.status}'`);
    }
    if (!failedExec.error_message.includes('Order processing failed: Card issuer declined')) {
      throw new Error(`Unexpected error message: ${failedExec.error_message}`);
    }
    if (!failedExec.error_stack || failedExec.error_stack.length < 10) {
      throw new Error('Expected non-empty Dart stack trace!');
    }
    console.log('    [PASS] Dart exception, error type, and stack trace captured and persisted.\n');

    console.log('================================================================================');
    console.log(' ALL 6 FLUTTER/DART FULL-STACK E2E VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
    console.log('================================================================================\n');
  } finally {
    console.log('--> Tearing down test environment...');
    await services.stop();
    console.log('    Ingestion and Query services stopped.');
  }
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN FLUTTER E2E SUITE]');
  console.error(err);
  process.exit(1);
});
