import type { AppLogger } from '../../../lib/logger';
import type { DeliveryEventRepository } from '../../storage';
import type { DeliveryEventProcessor, DeliveryEventProcessResult } from '../services';

export interface DeliveryWorkerOptions {
  logger?: AppLogger;
  processor: DeliveryEventProcessor;
  sendingTimeoutMs?: number;
  storage: {
    deliveryEvents: DeliveryEventRepository;
  };
}

export interface DeliveryWorkerRunOnceResult {
  processed: DeliveryEventProcessResult[];
  restoredSendingCount: number;
}

const DEFAULT_SENDING_TIMEOUT_MS = 5 * 60_000;

export class DeliveryWorker {
  private readonly sendingTimeoutMs: number;

  public constructor(private readonly options: DeliveryWorkerOptions) {
    this.sendingTimeoutMs = normalizeSendingTimeoutMs(options.sendingTimeoutMs);
  }

  public async recoverStartupState(referenceDate = new Date()): Promise<number> {
    const cutoffLockedAt = new Date(referenceDate.getTime() - this.sendingTimeoutMs).toISOString();
    const restoredCount = await this.options.storage.deliveryEvents.restoreTimedOutSending({
      cutoffLockedAt,
      nextRetryAt: referenceDate.toISOString(),
    });

    if (restoredCount > 0) {
      this.options.logger?.warn(
        { restoredCount },
        'restored timed out sending delivery events',
      );
    }

    return restoredCount;
  }

  public async runOnce(options: { recoverStartupState?: boolean } = {}): Promise<DeliveryWorkerRunOnceResult> {
    const restoredSendingCount =
      options.recoverStartupState === false ? 0 : await this.recoverStartupState();
    const dueEvents = await this.options.storage.deliveryEvents.listPendingForRetry(
      new Date().toISOString(),
    );
    const processed: DeliveryEventProcessResult[] = [];

    for (const event of dueEvents) {
      processed.push(await this.options.processor.processEvent(event.id));
    }

    return {
      processed,
      restoredSendingCount,
    };
  }
}

export function createDeliveryWorker(options: DeliveryWorkerOptions): DeliveryWorker {
  return new DeliveryWorker(options);
}

function normalizeSendingTimeoutMs(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_SENDING_TIMEOUT_MS;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Delivery worker sendingTimeoutMs must be a positive integer.');
  }

  return value;
}
