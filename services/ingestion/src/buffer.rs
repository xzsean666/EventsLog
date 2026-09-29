use eventslog_protocol::Event;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::{self, error::TrySendError, Receiver, Sender};
use tokio::task::JoinHandle;
use tokio::time::interval;
use tracing::{debug, warn};

/// Drop behavior policy when buffer is full.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DropPolicy {
    /// Drop newly incoming events when capacity is exceeded.
    DropNewest,
}

/// Configuration settings for the in-memory batch buffer.
#[derive(Debug, Clone)]
pub struct BatchBufferConfig {
    /// Maximum number of individual events allowed in the queue.
    pub max_capacity: usize,
    /// Number of events accumulated before triggering an immediate flush.
    pub batch_size: usize,
    /// Maximum delay before flushing a partially filled batch.
    pub flush_interval: Duration,
    /// Policy when buffer is saturated.
    pub drop_policy: DropPolicy,
}

impl Default for BatchBufferConfig {
    fn default() -> Self {
        Self {
            max_capacity: 50_000,
            batch_size: 1_000,
            flush_interval: Duration::from_millis(200),
            drop_policy: DropPolicy::DropNewest,
        }
    }
}

/// Performance and health statistics for the buffer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BufferStats {
    pub accepted: u64,
    pub dropped: u64,
    pub flushed: u64,
}

/// Bounded memory buffer decoupling HTTP ingestion from ClickHouse writing.
pub struct BatchBuffer {
    tx: Sender<Event>,
    accepted_count: Arc<AtomicU64>,
    dropped_count: Arc<AtomicU64>,
    flushed_count: Arc<AtomicU64>,
    _worker: JoinHandle<()>,
}

impl BatchBuffer {
    /// Spawns a new `BatchBuffer` with background batching worker.
    /// Flushed batches are dispatched to `batch_sink`.
    pub fn new(config: BatchBufferConfig, batch_sink: Sender<Vec<Event>>) -> Self {
        let (tx, rx) = mpsc::channel(config.max_capacity);
        let accepted_count = Arc::new(AtomicU64::new(0));
        let dropped_count = Arc::new(AtomicU64::new(0));
        let flushed_count = Arc::new(AtomicU64::new(0));

        let worker = tokio::spawn(Self::run_worker(
            rx,
            batch_sink,
            config.batch_size,
            config.flush_interval,
            flushed_count.clone(),
        ));

        Self {
            tx,
            accepted_count,
            dropped_count,
            flushed_count,
            _worker: worker,
        }
    }

    /// Enqueues a single event without blocking the caller.
    /// Returns `true` if accepted, or `false` if dropped due to buffer capacity.
    pub fn enqueue(&self, event: Event) -> bool {
        match self.tx.try_send(event) {
            Ok(()) => {
                self.accepted_count.fetch_add(1, Ordering::Relaxed);
                true
            }
            Err(TrySendError::Full(_)) => {
                let dropped = self.dropped_count.fetch_add(1, Ordering::Relaxed) + 1;
                if dropped % 1000 == 1 {
                    warn!(
                        total_dropped = dropped,
                        "BatchBuffer capacity exceeded, dropping events to defend memory."
                    );
                }
                false
            }
            Err(TrySendError::Closed(_)) => {
                warn!("BatchBuffer channel closed, dropping event.");
                self.dropped_count.fetch_add(1, Ordering::Relaxed);
                false
            }
        }
    }

    /// Enqueues a batch of events without blocking.
    /// Returns `(accepted_count, dropped_count)`.
    pub fn enqueue_batch(&self, events: Vec<Event>) -> (usize, usize) {
        let mut accepted = 0;
        let mut dropped = 0;

        for event in events {
            if self.enqueue(event) {
                accepted += 1;
            } else {
                dropped += 1;
            }
        }

        (accepted, dropped)
    }

    /// Current operational metrics.
    pub fn stats(&self) -> BufferStats {
        BufferStats {
            accepted: self.accepted_count.load(Ordering::Relaxed),
            dropped: self.dropped_count.load(Ordering::Relaxed),
            flushed: self.flushed_count.load(Ordering::Relaxed),
        }
    }

    async fn run_worker(
        mut rx: Receiver<Event>,
        batch_sink: Sender<Vec<Event>>,
        batch_size: usize,
        flush_interval: Duration,
        flushed_count: Arc<AtomicU64>,
    ) {
        let mut buffer = Vec::with_capacity(batch_size);
        let mut timer = interval(flush_interval);
        timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                maybe_event = rx.recv() => {
                    match maybe_event {
                        Some(event) => {
                            buffer.push(event);
                            if buffer.len() >= batch_size {
                                let batch = std::mem::replace(&mut buffer, Vec::with_capacity(batch_size));
                                let count = batch.len() as u64;
                                if let Err(e) = batch_sink.send(batch).await {
                                    warn!("Batch sink disconnected: {e}");
                                    break;
                                }
                                flushed_count.fetch_add(count, Ordering::Relaxed);
                            }
                        }
                        None => {
                            // Channel closed, flush remaining and exit
                            if !buffer.is_empty() {
                                let batch = std::mem::take(&mut buffer);
                                let count = batch.len() as u64;
                                let _ = batch_sink.send(batch).await;
                                flushed_count.fetch_add(count, Ordering::Relaxed);
                            }
                            break;
                        }
                    }
                }
                _ = timer.tick() => {
                    if !buffer.is_empty() {
                        let batch = std::mem::replace(&mut buffer, Vec::with_capacity(batch_size));
                        let count = batch.len() as u64;
                        debug!(count = count, "Timer triggered batch buffer flush");
                        if let Err(e) = batch_sink.send(batch).await {
                            warn!("Batch sink disconnected: {e}");
                            break;
                        }
                        flushed_count.fetch_add(count, Ordering::Relaxed);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use eventslog_protocol::{ExecutionStatus, FunctionExecution, FunctionIdentity};
    use serde_json::json;

    fn sample_event(id: &str) -> Event {
        let exec = FunctionExecution {
            function: FunctionIdentity::new("test_mod", id),
            input_payload: None,
            output_payload: Some(json!("ok")),
            duration_nanos: 1_000,
            status: ExecutionStatus::Success,
            error: None,
            attributes: None,
        };
        Event::new_function_execution("trace-1", id, "srv", "test", exec)
    }

    #[tokio::test]
    async fn test_size_triggered_flush() {
        let (sink_tx, mut sink_rx) = mpsc::channel(10);
        let config = BatchBufferConfig {
            max_capacity: 100,
            batch_size: 5,
            flush_interval: Duration::from_secs(60), // long interval
            drop_policy: DropPolicy::DropNewest,
        };

        let buffer = BatchBuffer::new(config, sink_tx);

        for i in 0..5 {
            assert!(buffer.enqueue(sample_event(&format!("ev_{i}"))));
        }

        let batch = tokio::time::timeout(Duration::from_millis(500), sink_rx.recv())
            .await
            .expect("timeout waiting for batch")
            .expect("batch received");

        assert_eq!(batch.len(), 5);
        assert_eq!(buffer.stats().accepted, 5);
        assert_eq!(buffer.stats().flushed, 5);
        assert_eq!(buffer.stats().dropped, 0);
    }

    #[tokio::test]
    async fn test_timer_triggered_flush() {
        let (sink_tx, mut sink_rx) = mpsc::channel(10);
        let config = BatchBufferConfig {
            max_capacity: 100,
            batch_size: 50, // large batch size
            flush_interval: Duration::from_millis(50),
            drop_policy: DropPolicy::DropNewest,
        };

        let buffer = BatchBuffer::new(config, sink_tx);

        // Push only 2 events, below batch_size 50
        assert!(buffer.enqueue(sample_event("ev_1")));
        assert!(buffer.enqueue(sample_event("ev_2")));

        let batch = tokio::time::timeout(Duration::from_millis(500), sink_rx.recv())
            .await
            .expect("timeout waiting for timer flush")
            .expect("batch received");

        assert_eq!(batch.len(), 2);
        assert_eq!(buffer.stats().flushed, 2);
    }

    #[tokio::test]
    async fn test_buffer_overflow_drop_policy() {
        let (sink_tx, _sink_rx) = mpsc::channel(1);
        let config = BatchBufferConfig {
            max_capacity: 2, // tiny capacity
            batch_size: 10,
            flush_interval: Duration::from_secs(10),
            drop_policy: DropPolicy::DropNewest,
        };

        let buffer = BatchBuffer::new(config, sink_tx);

        let mut accepted = 0;
        let mut dropped = 0;

        for i in 0..10 {
            if buffer.enqueue(sample_event(&format!("ev_{i}"))) {
                accepted += 1;
            } else {
                dropped += 1;
            }
        }

        assert!(dropped > 0, "Should have dropped events under capacity limit");
        assert_eq!(accepted + dropped, 10);
        let stats = buffer.stats();
        assert_eq!(stats.dropped, dropped as u64);
        assert_eq!(stats.accepted, accepted as u64);
    }
}
