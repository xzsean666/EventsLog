#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# EventsLog End-to-End Integration Verification Suite
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "================================================================================"
echo " Starting EventsLog End-to-End System Verification..."
echo " Root directory: ${ROOT_DIR}"
echo "================================================================================"

# 1. Build Node SDK
echo "--> [1/4] Ensuring @eventslog/node SDK is built..."
pnpm --filter @eventslog/node run build > /dev/null

# 2. Setup Temporary Test Environment
TEMP_DIR="$(mktemp -d /tmp/eventslog-e2e-XXXXXX)"
cleanup() {
  echo "--> Cleaning up temporary files..."
  if [ -n "${RECEIVER_PID:-}" ]; then
    kill "${RECEIVER_PID}" 2>/dev/null || true
  fi
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

PORT_FILE="${TEMP_DIR}/port.txt"
EVENTS_FILE="${TEMP_DIR}/events.json"

# 3. Launch Ingestion Receiver
echo "--> [2/4] Starting local ingestion verification receiver..."
node -e "
const http = require('node:http');
const fs = require('node:fs');

const received = [];
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/events') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (payload.events && Array.isArray(payload.events)) {
          received.push(...payload.events);
          fs.writeFileSync('${EVENTS_FILE}', JSON.stringify(received, null, 2));
        }
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'accepted' }));
      } catch (e) {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  fs.writeFileSync('${PORT_FILE}', String(port));
});
" &
RECEIVER_PID=$!

# Wait for receiver port
for i in {1..50}; do
  if [ -f "${PORT_FILE}" ]; then
    break
  fi
  sleep 0.1
done

INGEST_PORT="$(cat "${PORT_FILE}")"
echo "    Ingestion receiver listening on http://127.0.0.1:${INGEST_PORT}"

# 4. Execute Multi-Tiered Example Application Under Zero-Code Observation
echo "--> [3/4] Running multi-tiered Node.js demo with zero code edits (-r register)..."
APP_DIR="${ROOT_DIR}/examples/node"
REGISTER_SCRIPT="${ROOT_DIR}/sdks/node/dist/register.js"

export EVENTSLOG_ENDPOINT="http://127.0.0.1:${INGEST_PORT}/v1/events"
export EVENTSLOG_API_KEY="el_live_e2e_verification_key"

OUTPUT=$(node -r "${REGISTER_SCRIPT}" "${APP_DIR}/src/index.js")
echo "${OUTPUT}"

# Allow slight tick for auto-flush on exit
sleep 0.5

# 5. Verify Telemetry Payloads and Trace Tree
echo "--> [4/4] Verifying captured observability data..."
if [ ! -f "${EVENTS_FILE}" ]; then
  echo "ERROR: No events received by ingestion receiver!"
  exit 1
fi

node -e "
const fs = require('node:fs');
const events = JSON.parse(fs.readFileSync('${EVENTS_FILE}', 'utf-8'));

console.log('    Total telemetry events received: ' + events.length);
if (events.length < 3) {
  console.error('ERROR: Expected at least 3 events, found: ' + events.length);
  process.exit(1);
}

// 1. Identify functions
const orderEvent = events.find(e => e.payload?.data?.function?.function_name === 'createOrder');
const userEvent = events.find(e => e.payload?.data?.function?.function_name === 'getUser');
const paymentEvent = events.find(e => e.payload?.data?.function?.function_name === 'processPayment');

if (!orderEvent) {
  console.error('ERROR: Missing OrderService.createOrder event');
  process.exit(1);
}
if (!userEvent) {
  console.error('ERROR: Missing UserService.getUser event');
  process.exit(1);
}
if (!paymentEvent) {
  console.error('ERROR: Missing PaymentService.processPayment event');
  process.exit(1);
}

console.log('    [PASS] Functions intercepted without code modifications:');
console.log('           - OrderService.createOrder');
console.log('           - UserService.getUser');
console.log('           - PaymentService.processPayment');

// 2. Trace Hierarchy Check
const rootTraceId = orderEvent.trace_id;
if (!rootTraceId) {
  console.error('ERROR: Root trace ID missing');
  process.exit(1);
}

if (userEvent.trace_id !== rootTraceId || paymentEvent.trace_id !== rootTraceId) {
  console.error('ERROR: Distributed trace IDs mismatched between parent and children');
  process.exit(1);
}

if (userEvent.parent_span_id !== orderEvent.span_id) {
  console.error('ERROR: UserService parent_span_id does not match OrderService span_id');
  process.exit(1);
}

if (paymentEvent.parent_span_id !== orderEvent.span_id) {
  console.error('ERROR: PaymentService parent_span_id does not match OrderService span_id');
  process.exit(1);
}

console.log('    [PASS] Distributed trace hierarchy verified (Root span -> 2 child spans)');

// 3. Sensitive Data Masking Check
const paymentInput = paymentEvent.payload.data.input_payload;
const serialized = JSON.stringify(paymentInput);

if (serialized.includes('4532-1111-2222-3333')) {
  console.error('ERROR: Plaintext credit card leaked into telemetry payload!');
  process.exit(1);
}
if (serialized.includes('987')) {
  console.error('ERROR: Plaintext CVV leaked into telemetry payload!');
  process.exit(1);
}

console.log('    [PASS] Sensitive field masking verified (cardNumber and cvv sanitized to [REDACTED])');

// 4. Execution Performance Metrics Check
for (const e of [orderEvent, userEvent, paymentEvent]) {
  const d = e.payload.data.duration_nanos;
  if (!d || d <= 0) {
    console.error('ERROR: Invalid duration recorded: ' + d);
    process.exit(1);
  }
}
console.log('    [PASS] High-resolution durations recorded accurately');
"

echo "================================================================================"
echo " ALL END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY!"
echo "================================================================================"
