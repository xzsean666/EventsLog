#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "======================================================================"
echo "  EventsLog: Running Local Mode Full-Stack E2E Simulation"
echo "======================================================================"

cd "${ROOT_DIR}"

# 1. Build Rust Local Service
echo "[1/3] Building Rust local service binary (eventslog-local)..."
cargo build -p eventslog-local --bin eventslog-local

# 2. Build JavaScript/TypeScript packages
echo "[2/3] Building SDKs and Dashboard..."
pnpm --filter @eventslog/node build
pnpm --filter @eventslog/browser build
pnpm --filter dashboard build

# 3. Execute End-to-End Simulation
echo "[3/3] Running Full-Stack Simulation Suite..."
cd "${ROOT_DIR}/tests/e2e"
pnpm exec tsx src/local_mode_e2e.ts

echo "======================================================================"
echo "  Local Mode Simulation Finished Successfully!"
echo "======================================================================"
