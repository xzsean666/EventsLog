import type { Event, BatchEventPayload } from '../protocol/types.js';

export interface HttpTransportOptions {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
}

/**
 * Non-blocking HTTP transport for delivering batched telemetry events
 * to the EventsLog Ingestion Service.
 */
export class HttpTransport {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: HttpTransportOptions) {
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 2000;
  }

  /**
   * Dispatches a batch of events to the Ingestion Service.
   * Completely isolated: any network or server error is captured and returns false,
   * never throwing unhandled errors to the host application.
   */
  async sendBatch(events: Event[]): Promise<boolean> {
    if (!events || events.length === 0) {
      return true;
    }

    const payload: BatchEventPayload = { events };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        // Log at debug level to avoid spamming host logs
        console.warn(
          `[EventsLog] Ingestion endpoint returned HTTP ${response.status} ${response.statusText}`
        );
        return false;
      }

      return true;
    } catch (err) {
      // Complete error isolation
      console.warn(
        `[EventsLog] Failed to deliver event batch to ${this.endpoint}:`,
        err instanceof Error ? err.message : String(err)
      );
      return false;
    }
  }
}
