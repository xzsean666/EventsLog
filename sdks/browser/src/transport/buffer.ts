import { Event, BatchEventPayload } from '../protocol/types';
import type { IndexedDBStorage } from './indexeddb';

export interface TransportOptions {
  endpoint?: string;
  apiKey?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  headers?: Record<string, string>;
  disabled?: boolean;
  mode?: 'remote' | 'local' | 'auto';
  storage?: IndexedDBStorage;
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
  private readonly mode: 'remote' | 'local' | 'auto';
  private readonly storage?: IndexedDBStorage;

  constructor(options: TransportOptions) {
    this.endpoint = options.endpoint || 'http://localhost:8001/v1/events';
    this.apiKey = options.apiKey;
    this.batchSize = options.batchSize ?? 30;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.maxQueueSize = options.maxQueueSize ?? 1000;
    this.customHeaders = options.headers || {};
    this.disabled = !!options.disabled;
    this.mode = options.mode || 'auto';
    this.storage = options.storage;

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

        // In pure local mode: write directly to IndexedDB without any network requests
        if (this.mode === 'local') {
          if (this.storage) {
            await this.storage.insertBatch(batch);
          }
          continue;
        }

        // Remote or Auto mode: attempt remote transmission
        let remoteSuccess = false;
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
            remoteSuccess = true;
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
          try {
            const res = await fetch(this.endpoint, {
              method: 'POST',
              headers,
              body: jsonBody,
              keepalive: true,
              mode: 'cors',
            });
            if (res.ok || res.status < 500) {
              remoteSuccess = true;
            }
          } catch {
            remoteSuccess = false;
          }
        }

        // If remote delivery failed in auto mode, preserve telemetry in IndexedDB
        if (!remoteSuccess && this.mode === 'auto' && this.storage) {
          await this.storage.insertBatch(batch);
        }

        if (useBeacon && remoteSuccess) {
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

    if (typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', this.pagehideHandler);
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.visibilityHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.pagehideHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('pagehide', this.pagehideHandler);
      this.pagehideHandler = null;
    }
    void this.flush(true);
  }
}
