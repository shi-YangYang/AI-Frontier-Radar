export interface DeliveryRetryDecision {
  nextRetryAt: string | null;
  status: 'dead' | 'retry_wait';
}

export interface DeliveryRetryPolicyOptions {
  maxRetries?: number;
  retryDelaysMs?: readonly number[];
}

const DEFAULT_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
] as const;
const DEFAULT_MAX_RETRIES = 3;

export class DeliveryRetryPolicy {
  public readonly maxRetries: number;
  private readonly retryDelaysMs: readonly number[];

  public constructor(options: DeliveryRetryPolicyOptions = {}) {
    this.maxRetries = normalizeMaxRetries(options.maxRetries);
    this.retryDelaysMs = normalizeRetryDelays(options.retryDelaysMs, this.maxRetries);
  }

  public decide(input: {
    attemptCountAfterFailure: number;
    now: Date;
    retryable: boolean;
  }): DeliveryRetryDecision {
    if (!input.retryable || input.attemptCountAfterFailure > this.maxRetries) {
      return {
        nextRetryAt: null,
        status: 'dead',
      };
    }

    const delayMs = this.retryDelaysMs[input.attemptCountAfterFailure - 1];

    return {
      nextRetryAt: new Date(input.now.getTime() + delayMs).toISOString(),
      status: 'retry_wait',
    };
  }
}

export function createDeliveryRetryPolicy(
  options: DeliveryRetryPolicyOptions = {},
): DeliveryRetryPolicy {
  return new DeliveryRetryPolicy(options);
}

function normalizeMaxRetries(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_RETRIES;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Delivery retry maxRetries must be a non-negative integer.');
  }

  return value;
}

function normalizeRetryDelays(
  value: readonly number[] | undefined,
  maxRetries: number,
): readonly number[] {
  const delays = value ?? DEFAULT_RETRY_DELAYS_MS;

  if (delays.length < maxRetries) {
    throw new Error('Delivery retry delays must contain at least maxRetries entries.');
  }

  for (const delay of delays) {
    if (!Number.isInteger(delay) || delay <= 0) {
      throw new Error('Delivery retry delays must be positive integer millisecond values.');
    }
  }

  return delays;
}
