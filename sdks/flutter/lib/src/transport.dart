import 'dart:convert';
import 'dart:io';
import 'config.dart';
import 'models.dart';

/// HTTP transport for dispatching batches of EventsLog events to the Ingestion Service.
/// Uses standard `dart:io` HttpClient with zero external package dependencies.
class HttpTransport {
  final EventsLogConfig config;
  final HttpClient _client;

  HttpTransport({
    required this.config,
    HttpClient? client,
  }) : _client = client ?? (HttpClient()..connectionTimeout = const Duration(seconds: 5));

  /// Sends a batch of events to the ingestion endpoint.
  Future<bool> sendBatch(List<EventsLogEvent> events) async {
    if (events.isEmpty) return true;

    final body = jsonEncode({
      'events': events.map((e) => e.toJson()).toList(),
    });

    try {
      final uri = Uri.parse(config.endpoint);
      final request = await _client.postUrl(uri);
      request.headers.contentType = ContentType.json;
      if (config.headers != null) {
        config.headers!.forEach((k, v) => request.headers.set(k, v));
      }
      request.write(body);
      final response = await request.close();
      await response.drain();
      return response.statusCode >= 200 && response.statusCode < 300;
    } catch (_) {
      // Fail-Safe Observability: failures to send must never throw or disrupt the host application
      return false;
    }
  }

  void close() {
    _client.close(force: true);
  }
}
