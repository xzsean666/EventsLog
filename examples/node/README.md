# EventsLog Node.js Zero-Code Example Application

This example demonstrates zero-code function observability using `@eventslog/node`.

## Architecture

The application contains three multi-tiered services:
1. `OrderService`: coordinates order creation, pricing, user verification, and payment processing.
2. `UserService`: simulates database account lookups.
3. `PaymentService`: handles credit card transactions with sensitive billing data.

**Crucially, none of these files import any EventsLog library or APM code.**

## Configuration

The application is configured using `eventslog.yaml`:
- **Pattern Matching**: Automatically instruments `*Service.*`.
- **Sensitive Key Masking**: Redacts `cardNumber` and `cvv`.
- **Batching**: Automatically flushes every 10 events or 100ms.

## Running the Example

### 1. Build the Node.js SDK
```bash
pnpm --filter @eventslog/node run build
```

### 2. Run under Zero-Code Observation
```bash
# Using Node CommonJS pre-load flag (-r)
node -r ../../sdks/node/dist/register.js src/index.js

# Or using Node ESM import flag (--import)
node --import ../../sdks/node/dist/register.mjs src/index.js
```

### 3. Verify Captured Telemetry
- `OrderService.createOrder` creates the root trace span.
- `UserService.getUser` and `PaymentService.processPayment` create child spans inheriting the parent trace ID.
- Credit card details in inputs are automatically sanitized to `"[REDACTED]"`.
- All telemetry batches are flushed automatically before process termination.
