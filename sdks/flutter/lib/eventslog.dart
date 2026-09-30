import 'src/config.dart';
import 'src/models.dart';
import 'src/zone.dart';
import 'src/span.dart';
import 'src/buffer.dart';
import 'src/transport.dart';
import 'src/sanitizer.dart';

export 'src/config.dart';
export 'src/models.dart';
export 'src/zone.dart';
export 'src/span.dart';
export 'src/buffer.dart';
export 'src/transport.dart';
export 'src/sanitizer.dart';

/// Primary singleton interface for the EventsLog Flutter/Dart Observability SDK.
class EventsLog {
  static EventsLogConfig? defaultConfig;
  static EventsLogConfig _config = const EventsLogConfig(serviceName: 'flutter-app');
  static HttpTransport? _transport;
  static AutoBatchBuffer? _buffer;
  static bool _initialized = false;

  /// Initializes the EventsLog SDK with optional configuration.
  static void init([EventsLogConfig? config]) {
    if (config != null) {
      _config = config;
    } else if (defaultConfig != null) {
      _config = defaultConfig!;
    }
    _transport?.close();
    _buffer?.close();

    _transport = HttpTransport(config: _config);
    _buffer = AutoBatchBuffer(config: _config, transport: _transport!);
    _initialized = true;
  }

  /// Whether the SDK has been initialized.
  static bool get isInitialized => _initialized;

  /// Current active configuration.
  static EventsLogConfig get config => _config;

  /// Returns the current active trace ID from the async Zone hierarchy.
  static String? get currentTraceId => EventsLogZone.currentTraceId;

  /// Returns the current active span ID from the async Zone hierarchy.
  static String? get currentSpanId => EventsLogZone.currentSpanId;

  /// Returns distributed tracing HTTP headers (W3C traceparent and EventsLog headers).
  ///
  /// Can be merged into Dio or http client request headers to propagate trace context
  /// from the mobile application to backend services.
  static Map<String, String> getTraceHeaders() {
    final traceId = currentTraceId;
    final spanId = currentSpanId;
    if (traceId == null || spanId == null) {
      return const {};
    }
    final normalizedTrace = traceId.padLeft(32, '0');
    final normalizedSpan = spanId.padLeft(16, '0');
    return {
      'traceparent': '00-$normalizedTrace-$normalizedSpan-01',
      'x-eventslog-trace-id': traceId,
      'x-eventslog-span-id': spanId,
    };
  }

  /// Starts a new function execution span.
  ///
  /// If invoked within an existing trace context, the span automatically links to
  /// the active `traceId` and designates the active `spanId` as its `parentSpanId`.
  static EventsLogSpan startSpan({
    required String functionName,
    String? module,
    String? className,
    String? filePath,
    int? lineNumber,
    Map<String, dynamic>? arguments,
  }) {
    if (!_initialized) {
      init(defaultConfig);
    }

    final parentSpanId = EventsLogZone.currentSpanId;
    final traceId = EventsLogZone.currentTraceId ?? generateTraceId();
    final spanId = generateSpanId();

    return EventsLogSpan(
      traceId: traceId,
      spanId: spanId,
      parentSpanId: parentSpanId,
      module: module ?? filePath ?? 'app',
      className: className,
      functionName: functionName,
      filePath: filePath,
      lineNumber: lineNumber,
      arguments: arguments,
      config: _config,
      buffer: _buffer!,
    );
  }

  /// Executes [body] within a new function execution span and binds the Zone context.
  ///
  /// Automatically calls `span.finish()` on success, or `span.fail()` and rethrows on error.
  static R runWithSpan<R>({
    required String functionName,
    String? module,
    String? className,
    String? filePath,
    int? lineNumber,
    Map<String, dynamic>? arguments,
    required R Function() body,
  }) {
    final span = startSpan(
      functionName: functionName,
      module: module,
      className: className,
      filePath: filePath,
      lineNumber: lineNumber,
      arguments: arguments,
    );

    return EventsLogZone.runInSpan<R>(
      traceId: span.traceId,
      spanId: span.spanId,
      body: () {
        try {
          final result = body();
          if (result is Future) {
            result.then((val) {
              span.finish(output: val);
            }, onError: (Object err, StackTrace st) {
              span.fail(error: err, stackTrace: st);
            });
            return result;
          } else {
            span.finish(output: result);
            return result;
          }
        } catch (e, st) {
          span.fail(error: e, stackTrace: st);
          rethrow;
        }
      },
    );
  }


  /// Manually flushes buffered events to the Ingestion Service.
  static Future<void> flush() async {
    if (_buffer != null) {
      await _buffer!.flush();
    }
  }

  /// Flushes remaining events and cleans up timers and network connections.
  static Future<void> close() async {
    if (_buffer != null) {
      await _buffer!.close();
    }
    _transport?.close();
    _buffer = null;
    _transport = null;
    _initialized = false;
  }
}
