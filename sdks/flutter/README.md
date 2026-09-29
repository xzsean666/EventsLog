# EventsLog Flutter & Dart SDK

Zero-Code Function Observability and Source-Level AST Instrumentation for Flutter & Dart applications.

---

## 1. Overview

In Flutter and Dart applications, Ahead-Of-Time (AOT) compilation and the omission of runtime reflection (`dart:mirrors`) prevent runtime dynamic monkey-patching.

**EventsLog solves this via Build-Time AST Code Instrumentation**:
- **0 Business-Code Modification**: Developers only maintain a declarative `eventslog.yaml` configuration.
- **Safe Build-Time Injection & Atomic Rollback**: Before compiling (e.g. `flutter build apk` or `flutter run`), target functions are automatically wrapped with telemetry hooks; original source files are safely backed up to `.eventslog_backup/` and restored after build without polluting Git.
- **Dart Zone Asynchronous Context Propagation**: Full distributed trace continuity across `Future`, `Stream`, and async task boundaries.
- **Universal Auto-Batching Engine**: Dual-trigger flush (count & timer) with bounded memory queues and drop-on-overflow resilience.

---

## 2. Quick Start

### Step 1: Add Dependency

In your Flutter app's `pubspec.yaml`:

```yaml
dependencies:
  eventslog_flutter:
    path: path/to/sdks/flutter # Or git / pub.dev
```

### Step 2: Create Configuration (`eventslog.yaml`)

Place an `eventslog.yaml` file in your Flutter project root:

```yaml
eventslog:
  service_name: "flutter-ecommerce-app"
  environment: "production"
  endpoint: "http://localhost:8080/v1/events/batch"
  
  # Dual-trigger batching buffer
  batch_size: 100
  flush_interval_ms: 500
  max_queue_size: 1000

  # Payloads
  capture_arguments: true
  capture_returns: true

  # Declarative function inclusion rules
  include:
    - "lib/services/**"
    - "lib/bloc/**"
    - "OrderService.*"

  # Exclude rules
  exclude:
    - "*_test.dart"
    - "*.g.dart"
    - "*.freezed.dart"
```

### Step 3: Run with Zero-Code Instrumentation

Use the `eventslog-flutter` CLI to run or build your application:

```bash
# Automatically: injects hooks -> builds APK -> restores original code
npx @eventslog/flutter run -- flutter build apk

# Or for local development:
npx @eventslog/flutter run -- flutter run
```

---

## 3. CLI Commands

| Command | Description |
| :--- | :--- |
| `eventslog-flutter inject` | Instruments target functions based on `eventslog.yaml` and backs up original files to `.eventslog_backup/`. |
| `eventslog-flutter restore` | Restores original source files from `.eventslog_backup/` and removes the backup directory. |
| `eventslog-flutter run -- <cmd>` | Wraps target command with automated lifecycle: injects before execution, and automatically restores on exit or error. |
| `eventslog-flutter status` | Displays current project instrumentation and backup status. |

---

## 4. AST Transformation Example

Given the original business code:

```dart
class OrderService {
  Future<Order> createOrder(String userId, double amount) async {
    final response = await api.submit(userId, amount);
    return Order.fromJson(response);
  }
}
```

The AST Transformer automatically rewrites it into:

```dart
// @eventslog:instrumented
import 'package:eventslog_flutter/eventslog.dart';

class OrderService {
  Future<Order> createOrder(String userId, double amount) async {
    return await EventsLog.runWithSpan(
      functionName: 'OrderService.createOrder',
      className: 'OrderService',
      filePath: 'lib/services/order_service.dart',
      arguments: {'userId': userId, 'amount': amount},
      body: () async {
        final response = await api.submit(userId, amount);
        return Order.fromJson(response);
      },
    );
  }
}
```

---

## 5. Architectural Guarantees

1. **Idempotency**: Already instrumented files (`// @eventslog:instrumented`) are never double-instrumented.
2. **Fail-Safe Observability**: Errors in telemetry reporting or network disconnects never interrupt or crash host application logic.
3. **Zero Git Pollution**: With `eventslog-flutter run` or `restore`, sources remain completely untouched in version control.
