import 'dart:async';
import 'dart:collection';
import 'config.dart';
import 'models.dart';
import 'transport.dart';

/// Universal dual-trigger auto-batching ring buffer for EventsLog events.
class AutoBatchBuffer {
  final EventsLogConfig config;
  final HttpTransport transport;
  final Queue<EventsLogEvent> _queue = Queue<EventsLogEvent>();
  Timer? _timer;
  bool _isFlushing = false;
  int _droppedCount = 0;
  int _consecutiveFailures = 0;

  AutoBatchBuffer({
    required this.config,
    required this.transport,
  }) {
    if (config.flushIntervalMs > 0) {
      _timer = Timer.periodic(
        Duration(milliseconds: config.flushIntervalMs),
        (_) => flush(),
      );
    }
  }

  /// Current number of buffered events.
  int get length => _queue.length;

  /// Total number of events dropped due to buffer capacity overflow or exhausted retries.
  int get droppedCount => _droppedCount;

  /// Enqueues an event into the batch buffer.
  void enqueue(EventsLogEvent event) {
    if (_queue.length >= config.maxQueueSize) {
      // Safe drop policy on queue overflow
      _queue.removeFirst();
      _droppedCount++;
    }

    _queue.addLast(event);

    // Count-triggered flush
    if (_queue.length >= config.batchSize) {
      flush();
    }
  }

  /// Flushes all currently queued events immediately.
  Future<void> flush() async {
    if (_isFlushing || _queue.isEmpty) return;
    _isFlushing = true;

    final batch = <EventsLogEvent>[];
    while (_queue.isNotEmpty && batch.length < config.batchSize) {
      batch.add(_queue.removeFirst());
    }

    try {
      if (batch.isNotEmpty) {
        final ok = await transport.sendBatch(batch);
        if (ok) {
          _consecutiveFailures = 0;
        } else {
          _handleFailure(batch);
        }
      }
    } catch (_) {
      _handleFailure(batch);
    } finally {
      _isFlushing = false;
      // If there are still events left and we have not exceeded max retries, trigger another flush
      if (_queue.isNotEmpty && _queue.length >= config.batchSize && _consecutiveFailures < config.maxRetryAttempts) {
        flush();
      }
    }
  }

  void _handleFailure(List<EventsLogEvent> batch) {
    _consecutiveFailures++;
    if (_consecutiveFailures <= config.maxRetryAttempts) {
      _requeueBatch(batch);
    } else {
      _droppedCount += batch.length;
    }
  }

  void _requeueBatch(List<EventsLogEvent> failedBatch) {
    for (int i = failedBatch.length - 1; i >= 0; i--) {
      if (_queue.length < config.maxQueueSize) {
        _queue.addFirst(failedBatch[i]);
      } else {
        _droppedCount++;
      }
    }
  }

  /// Cancels timer and flushes any remaining buffered events.
  Future<void> close() async {
    _timer?.cancel();
    _timer = null;
    if (_queue.isNotEmpty) {
      final batch = <EventsLogEvent>[];
      while (_queue.isNotEmpty && batch.length < config.batchSize) {
        batch.add(_queue.removeFirst());
      }
      try {
        await transport.sendBatch(batch);
      } catch (_) {}
      _queue.clear();
    }
  }
}
