import 'dart:convert';
import 'config.dart';
import 'models.dart';
import 'buffer.dart';

/// Represents an active or completed function execution span.
class EventsLogSpan {
  final String traceId;
  final String spanId;
  final String? parentSpanId;
  final String module;
  final String? className;
  final String functionName;
  final String? filePath;
  final int? lineNumber;
  final Map<String, dynamic>? arguments;
  final EventsLogConfig config;
  final AutoBatchBuffer buffer;
  final Stopwatch _stopwatch;
  bool _completed = false;

  EventsLogSpan({
    required this.traceId,
    required this.spanId,
    this.parentSpanId,
    required this.module,
    this.className,
    required this.functionName,
    this.filePath,
    this.lineNumber,
    this.arguments,
    required this.config,
    required this.buffer,
  }) : _stopwatch = Stopwatch()..start();

  /// Marks the span as successfully finished and records output payload.
  void finish({dynamic output}) {
    if (_completed) return;
    _completed = true;
    _stopwatch.stop();

    final durationNanos = _stopwatch.elapsedMicroseconds * 1000;

    final event = EventsLogEvent(
      traceId: traceId,
      spanId: spanId,
      parentSpanId: parentSpanId,
      serviceName: config.serviceName,
      environment: config.environment,
      execution: FunctionExecution(
        function: FunctionIdentity(
          module: module,
          className: className,
          functionName: functionName,
          filePath: filePath,
          lineNumber: lineNumber,
        ),
        inputPayload: config.captureArguments ? arguments : null,
        outputPayload: config.captureReturns ? _sanitize(output) : null,
        durationNanos: durationNanos,
        status: 'success',
      ),
    );

    buffer.enqueue(event);
  }

  /// Marks the span as failed and records the captured error and stack trace.
  void fail({required Object error, StackTrace? stackTrace}) {
    if (_completed) return;
    _completed = true;
    _stopwatch.stop();

    final durationNanos = _stopwatch.elapsedMicroseconds * 1000;

    final event = EventsLogEvent(
      traceId: traceId,
      spanId: spanId,
      parentSpanId: parentSpanId,
      serviceName: config.serviceName,
      environment: config.environment,
      execution: FunctionExecution(
        function: FunctionIdentity(
          module: module,
          className: className,
          functionName: functionName,
          filePath: filePath,
          lineNumber: lineNumber,
        ),
        inputPayload: config.captureArguments ? arguments : null,
        durationNanos: durationNanos,
        status: 'error',
        error: ExecutionError.fromError(error, stackTrace),
      ),
    );

    buffer.enqueue(event);
  }

  dynamic _sanitize(dynamic val) {
    if (val == null) return null;
    if (val is num || val is bool || val is String) return val;
    try {
      // Test JSON encodability
      jsonEncode(val);
      return val;
    } catch (_) {
      return val.toString();
    }
  }
}
