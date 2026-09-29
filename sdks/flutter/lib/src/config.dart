/// Configuration options for the EventsLog Flutter/Dart SDK.
class EventsLogConfig {
  /// Name of the service or application.
  final String serviceName;

  /// Runtime environment (e.g. 'production', 'staging', 'development').
  final String environment;

  /// HTTP endpoint for the EventsLog Ingestion Service.
  final String endpoint;

  /// Maximum number of events to buffer before triggering an automatic batch flush.
  final int batchSize;

  /// Maximum interval in milliseconds between automatic batch flushes.
  final int flushIntervalMs;

  /// Maximum number of events allowed in the queue. Events exceeding this are safely dropped.
  final int maxQueueSize;

  /// Whether to record function arguments in input payloads.
  final bool captureArguments;

  /// Whether to record function return values in output payloads.
  final bool captureReturns;

  /// Optional HTTP headers (e.g. Authorization tokens) sent with ingestion requests.
  final Map<String, String>? headers;

  const EventsLogConfig({
    required this.serviceName,
    this.environment = 'production',
    this.endpoint = 'http://localhost:8080/v1/events/batch',
    this.batchSize = 100,
    this.flushIntervalMs = 500,
    this.maxQueueSize = 1000,
    this.captureArguments = true,
    this.captureReturns = true,
    this.headers,
  });

  factory EventsLogConfig.fromJson(Map<String, dynamic> json) {
    return EventsLogConfig(
      serviceName: json['service_name'] as String? ?? 'flutter-app',
      environment: json['environment'] as String? ?? 'production',
      endpoint: json['endpoint'] as String? ?? 'http://localhost:8080/v1/events/batch',
      batchSize: (json['batch_size'] as num?)?.toInt() ?? 100,
      flushIntervalMs: (json['flush_interval_ms'] as num?)?.toInt() ?? 500,
      maxQueueSize: (json['max_queue_size'] as num?)?.toInt() ?? 1000,
      captureArguments: json['capture_arguments'] as bool? ?? true,
      captureReturns: json['capture_returns'] as bool? ?? true,
      headers: (json['headers'] as Map<String, dynamic>?)?.map(
        (k, v) => MapEntry(k, v.toString()),
      ),
    );
  }
}
