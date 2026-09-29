/**
 * Evaluates execution sampling decisions.
 */
export class Sampler {
  private readonly rate: number;

  constructor(rate: number = 1.0) {
    this.rate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Returns true if an execution should be sampled.
   * If a traceId is provided, uses deterministic hashing based on the trace ID's suffix.
   */
  shouldSample(traceId?: string): boolean {
    if (this.rate >= 1.0) return true;
    if (this.rate <= 0.0) return false;

    if (traceId && traceId.length >= 8) {
      // Deterministically parse last 4 hex characters (0 - 65535)
      const hex = traceId.slice(-4);
      const val = parseInt(hex, 16);
      if (!isNaN(val)) {
        return val / 65536.0 < this.rate;
      }
    }

    return Math.random() < this.rate;
  }
}
