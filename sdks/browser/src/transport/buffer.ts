import { Event, BatchEventPayload } from '../protocol/types';

export interface TransportOptions {
  endpoint: string;
  apiKey?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  headers?: Record<string, string>;
  disabled?: boolean;
}

export class BrowserBatchBuffer {
  private queue: Event[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private isDestroyed = false;

  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueueSize: number;
  private readonly customHeaders: Record<string, string>;
  private readonly disabled: boolean;

  constructor(options: TransportOptions) {
    this.endpoint = options.endpoint || 'http://localhost:8001/v1/events';
    this.apiKey = options.apiKey;
    this.batchSize = options.batchSize ?? 30;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.maxQueueSize = options.maxQueueSize ?? 1000;
    this.customHeaders = options.headers || {};
    this.disabled = !!options.disabled;

    this.startTimer();
    this.setupPageUnloadHandlers();
  }

  enqueue(event: Event): void {
    if (this.disabled || this.isDestroyed) {
      return;
    }

    if (this.queue.length >= this.maxQueueSize) {
      // Ring buffer overflow: drop oldest to keep recent telemetry
      this.queue.shift();
    }

    this.queue.push(event);

    if (this.queue.length >= this.batchSize) {
      void this.flush();
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  private visibilityHandler: (() => void) | null = null;
  private pagehideHandler: (() => void) | null = null;

  async flush(useBeacon = false): Promise<void> {
    if (this.queue.length === 0 || this.isFlushing || this.disabled) {
      return;
    }

    this.isFlushing = true;

    try {
      while (this.queue.length > 0) {
        const batch = useBeacon
          ? this.queue.splice(0, Math.min(this.queue.length, 200))
          : this.queue.splice(0, this.batchSize);

        const payload: BatchEventPayload = { events: batch };
        const jsonBody = JSON.stringify(payload);

        let beaconEndpoint = this.endpoint;
        if (this.apiKey) {
          const delimiter = beaconEndpoint.includes('?') ? '&' : '?';
          beaconEndpoint = `${beaconEndpoint}${delimiter}api_key=${encodeURIComponent(this.apiKey)}`;
        }

        if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const blob = new Blob([jsonBody], { type: 'application/json' });
          const sent = navigator.sendBeacon(beaconEndpoint, blob);
          if (sent) {
            break;
          }
        }

        // Standard HTTP fetch transport with keepalive for high reliability
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...this.customHeaders,
        };

        if (this.apiKey) {
          headers['X-API-Key'] = this.apiKey;
        }

        if (typeof fetch !== 'undefined') {
          await fetch(this.endpoint, {
            method: 'POST',
            headers,
            body: jsonBody,
            keepalive: true,
            mode: 'cors',
          });
        }

        if (useBeacon) {
          break;
        }
      }
    } catch {
      // Non-intrusive: never crash client host application
    } finally {
      this.isFlushing = false;
    }
  }

  private startTimer(): void {
    if (typeof window !== 'undefined' && typeof setInterval !== 'undefined') {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, this.flushIntervalMs);
    }
  }

  private setupPageUnloadHandlers(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        void this.flush(true);
      }
    };

    this.pagehideHandler = () => {
      void this.flush(true);
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('pagehide', this.pagehideHandler);
  }

  destroy(): void {
    this.isDestroyed = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.pagehideHandler && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.pagehideHandler);
      this.pagehideHandler = null;
    }
    void this.flush(true);
  }
}
