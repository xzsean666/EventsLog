import type { Event } from '../protocol/types.js';
import type { HttpTransport } from '../transport/http.js';
import { DEFAULT_BATCHING_CONFIG } from '../config/types.js';

export interface BatcherTransport {
  sendBatch(events: Event[]): Promise<boolean>;
}

export interface EventBatcherOptions {
  /**
   * Number of events required to trigger an immediate batch transmission.
   * Default: 100.
   */
  maxBatchSize?: number;
  /**
   * Maximum interval in milliseconds before buffered events are flushed.
   * Default: 500.
   */
  flushIntervalMs?: number;
  /**
   * Maximum number of events allowed in memory. Surplus events are dropped safely.
   * Default: 5000.
   */
  maxQueueSize?: number;
  /**
   * Transport implementation responsible for delivering batches.
   */
  transport: BatcherTransport | HttpTransport;
}

/**
 * High-performance dual-trigger auto-batching buffer.
 * Automatically flushes on record count threshold OR elapsed timer interval,
 * and drops surplus events if queue capacity is exceeded.
 */
export class EventBatcher {
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueueSize: number;
  private readonly transport: BatcherTransport;

  private buffer: Event[] = [];
  private timer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private isShutdown = false;

  private droppedEventsCount = 0;
  private totalFlushedCount = 0;

  constructor(options: EventBatcherOptions) {
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_BATCHING_CONFIG.max_batch_size;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_BATCHING_CONFIG.flush_interval_ms;
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_BATCHING_CONFIG.max_queue_size;
    this.transport = options.transport;

    this.startTimer();
  }

  /**
   * Pushes a new event into the batching buffer.
   * Triggers an immediate flush if the buffer reaches `maxBatchSize`.
   * Returns true if accepted, false if dropped due to queue overflow.
   */
  push(event: Event): boolean {
    if (this.isShutdown) {
      return false;
    }

    // Bounded drop policy
    if (this.buffer.length >= this.maxQueueSize) {
      this.droppedEventsCount++;
      if (this.droppedEventsCount % 100 === 1) {
        console.warn(
          `[EventsLog] In-memory event queue full (${this.maxQueueSize}). Dropped ${this.droppedEventsCount} events.`
        );
      }
      return false;
    }

    this.buffer.push(event);

    // Count-triggered auto-batch
    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush();
    }

    return true;
  }

  /**
   * Flushes all currently buffered events to the transport.
   * Drains in chunks of up to `maxBatchSize`.
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;
    try {
      while (this.buffer.length > 0) {
        const batch = this.buffer.splice(0, this.maxBatchSize);
        if (batch.length === 0) break;

        const ok = await this.transport.sendBatch(batch);
        if (ok) {
          this.totalFlushedCount += batch.length;
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Stops the background timer and flushes any remaining buffered events.
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return;
    }
    this.isShutdown = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    await this.flush();
  }

  /**
   * Number of events currently waiting in buffer.
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Total number of events dropped due to maxQueueSize overflow.
   */
  getDroppedCount(): number {
    return this.droppedEventsCount;
  }

  /**
   * Total number of events successfully transmitted.
   */
  getTotalFlushedCount(): number {
    return this.totalFlushedCount;
  }

  private startTimer(): void {
    if (this.flushIntervalMs > 0) {
      this.timer = setInterval(() => {
        void this.flush();
      }, this.flushIntervalMs);

      // Unref the timer so it doesn't hold the Node.js event loop open
      if (this.timer && typeof this.timer.unref === 'function') {
        this.timer.unref();
      }
    }
  }
}
