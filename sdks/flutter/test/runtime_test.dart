import 'package:test/test.dart';
import 'package:eventslog_flutter/eventslog.dart';

void main() {
  group('EventsLog Dart Runtime', () {
    tearDown(() async {
      await EventsLog.close();
    });

    test('initializes and manages lifecycle', () async {
      expect(EventsLog.isInitialized, isFalse);

      EventsLog.init(const EventsLogConfig(
        serviceName: 'test-flutter-service',
        environment: 'unit-test',
        batchSize: 10,
        flushIntervalMs: 100,
      ));

      expect(EventsLog.isInitialized, isTrue);
      expect(EventsLog.config.serviceName, equals('test-flutter-service'));
      expect(EventsLog.config.environment, equals('unit-test'));

      await EventsLog.close();
      expect(EventsLog.isInitialized, isFalse);
    });

    test('EventsLogZone propagates trace and span IDs', () {
      final traceId = generateTraceId();
      final spanId = generateSpanId();

      expect(EventsLogZone.currentTraceId, isNull);
      expect(EventsLogZone.currentSpanId, isNull);

      EventsLogZone.runInSpan(
        traceId: traceId,
        spanId: spanId,
        body: () {
          expect(EventsLogZone.currentTraceId, equals(traceId));
          expect(EventsLogZone.currentSpanId, equals(spanId));
        },
      );

      expect(EventsLogZone.currentTraceId, isNull);
      expect(EventsLogZone.currentSpanId, isNull);
    });

    test('getTraceHeaders formats W3C traceparent and platform headers', () {
      final traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      final spanId = '00f067aa0ba902b7';

      EventsLogZone.runInSpan(
        traceId: traceId,
        spanId: spanId,
        body: () {
          final headers = EventsLog.getTraceHeaders();
          expect(headers['traceparent'], equals('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'));
          expect(headers['x-eventslog-trace-id'], equals(traceId));
          expect(headers['x-eventslog-span-id'], equals(spanId));
        },
      );

      final emptyHeaders = EventsLog.getTraceHeaders();
      expect(emptyHeaders, isEmpty);
    });

    test('runWithSpan executes function and captures output', () async {
      EventsLog.init(const EventsLogConfig(
        serviceName: 'test-service',
        batchSize: 50,
      ));

      final result = await EventsLog.runWithSpan<Future<int>>(
        functionName: 'Calculator.sum',
        arguments: {'a': 10, 'b': 20, 'password': 'mySecretPassword'},
        body: () async {
          await Future<void>.delayed(const Duration(milliseconds: 10));
          return 30;
        },
      );

      expect(result, equals(30));
    });
  });
}
