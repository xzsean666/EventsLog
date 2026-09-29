import 'dart:convert';
import 'dart:math';

/// Generates a random 32-character hexadecimal trace ID (UUID-like).
String generateTraceId() {
  final random = Random.secure();
  final values = List<int>.generate(16, (i) => random.nextInt(256));
  return values.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
}

/// Generates a random 16-character hexadecimal span ID.
String generateSpanId() {
  final random = Random.secure();
  final values = List<int>.generate(8, (i) => random.nextInt(256));
  return values.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
}

/// Generates a UUID v4 event ID.
String generateEventId() {
  final random = Random.secure();
  final values = List<int>.generate(16, (i) => random.nextInt(256));
  values[6] = (values[6] & 0x0f) | 0x40; // v4
  values[8] = (values[8] & 0x3f) | 0x80; // variant
  final hex = values.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}';
}

/// Identity and location of an observed function in Dart.
class FunctionIdentity {
  final String module;
  final String? className;
  final String functionName;
  final String? filePath;
  final int? lineNumber;

  const FunctionIdentity({
    required this.module,
    this.className,
    required this.functionName,
    this.filePath,
    this.lineNumber,
  });

  Map<String, dynamic> toJson() => {
    'module': module,
    if (className != null) 'class_name': className,
    'function_name': functionName,
    if (filePath != null) 'file_path': filePath,
    if (lineNumber != null) 'line_number': lineNumber,
  };
}

/// Error details captured from a failed function execution.
class ExecutionError {
  final String typeName;
  final String message;
  final String? stackTrace;

  const ExecutionError({
    required this.typeName,
    required this.message,
    this.stackTrace,
  });

  factory ExecutionError.fromError(Object error, [StackTrace? stackTrace]) {
    return ExecutionError(
      typeName: error.runtimeType.toString(),
      message: error.toString(),
      stackTrace: stackTrace?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
    'type_name': typeName,
    'message': message,
    if (stackTrace != null) 'stack_trace': stackTrace,
  };
}

/// Execution outcome and metrics for an observed function invocation.
class FunctionExecution {
  final FunctionIdentity function;
  final dynamic inputPayload;
  final dynamic outputPayload;
  final int durationNanos;
  final String status; // 'success' | 'error'
  final ExecutionError? error;
  final Map<String, dynamic>? attributes;

  const FunctionExecution({
    required this.function,
    this.inputPayload,
    this.outputPayload,
    required this.durationNanos,
    required this.status,
    this.error,
    this.attributes,
  });

  Map<String, dynamic> toJson() => {
    'function': function.toJson(),
    if (inputPayload != null) 'input_payload': inputPayload,
    if (outputPayload != null) 'output_payload': outputPayload,
    'duration_nanos': durationNanos,
    'status': status,
    if (error != null) 'error': error!.toJson(),
    if (attributes != null) 'attributes': attributes,
  };
}

/// Top-level wire event for the EventsLog Ingestion protocol.
class EventsLogEvent {
  final String eventId;
  final String traceId;
  final String spanId;
  final String? parentSpanId;
  final DateTime timestamp;
  final String serviceName;
  final String environment;
  final String eventType;
  final FunctionExecution execution;

  EventsLogEvent({
    String? eventId,
    required this.traceId,
    required this.spanId,
    this.parentSpanId,
    DateTime? timestamp,
    required this.serviceName,
    required this.environment,
    this.eventType = 'function_execution',
    required this.execution,
  })  : eventId = eventId ?? generateEventId(),
        timestamp = timestamp ?? DateTime.now().toUtc();

  Map<String, dynamic> toJson() => {
    'event_id': eventId,
    'trace_id': traceId,
    'span_id': spanId,
    if (parentSpanId != null) 'parent_span_id': parentSpanId,
    'timestamp': timestamp.toIso8601String(),
    'service_name': serviceName,
    'environment': environment,
    'event_type': eventType,
    'payload': {
      'type': 'function_execution',
      'data': execution.toJson(),
    },
  };
}
