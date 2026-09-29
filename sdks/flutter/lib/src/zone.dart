import 'dart:async';

/// Symbol keys used for storing trace context in Dart Zones.
const Symbol _traceIdKey = #eventslog_trace_id;
const Symbol _spanIdKey = #eventslog_span_id;

/// Asynchronous trace context management using Dart Zones.
class EventsLogZone {
  /// Returns the current active trace ID within the current Zone, if any.
  static String? get currentTraceId => Zone.current[_traceIdKey] as String?;

  /// Returns the current active span ID within the current Zone, if any.
  static String? get currentSpanId => Zone.current[_spanIdKey] as String?;

  /// Runs the given [body] in a child Zone bound to the specified [traceId] and [spanId].
  ///
  /// Any asynchronous operations (Futures, Streams, Timers) started within [body]
  /// inherit this trace and span context automatically without explicit parameter passing.
  static R runInSpan<R>({
    required String traceId,
    required String spanId,
    required R Function() body,
  }) {
    return runZoned<R>(
      body,
      zoneValues: {
        _traceIdKey: traceId,
        _spanIdKey: spanId,
      },
    );
  }
}
