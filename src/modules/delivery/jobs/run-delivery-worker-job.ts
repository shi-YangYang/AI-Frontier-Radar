import type { AppLogger } from '../../../lib/logger';
import type { StorageContext } from '../../storage';
import {
  createDefaultDeliveryChannelRegistry,
  type DeliveryChannelRegistry,
  type DeliveryChannelRegistryOptions,
} from '../channel';
import { createV1TextMessageFormatter, type V1TextMessageFormatterOptions } from '../formatter';
import { createDeliveryEventProcessor, createDeliveryRetryPolicy } from '../services';
import type { DeliveryRetryPolicyOptions } from '../services';
import { createDeliveryWorker, type DeliveryWorkerRunOnceResult } from '../worker';

export interface RunDeliveryWorkerJobOptions {
  channelRegistry?: DeliveryChannelRegistry;
  channelRegistryOptions?: DeliveryChannelRegistryOptions;
  formatterOptions?: V1TextMessageFormatterOptions;
  logger?: AppLogger;
  recoverStartupState?: boolean;
  retryPolicyOptions?: DeliveryRetryPolicyOptions;
  sendingTimeoutMs?: number;
  storage: Pick<StorageContext, 'deliveryEvents' | 'deliveryTargets' | 'xPosts'>;
}

export async function runDeliveryWorkerJob(
  options: RunDeliveryWorkerJobOptions,
): Promise<DeliveryWorkerRunOnceResult> {
  const channels =
    options.channelRegistry ?? createDefaultDeliveryChannelRegistry(options.channelRegistryOptions);
  const formatter = createV1TextMessageFormatter(options.formatterOptions);
  const retryPolicy = createDeliveryRetryPolicy(options.retryPolicyOptions);
  const processor = createDeliveryEventProcessor({
    channels,
    formatter,
    logger: options.logger,
    retryPolicy,
    storage: options.storage,
  });
  const worker = createDeliveryWorker({
    logger: options.logger,
    processor,
    sendingTimeoutMs: options.sendingTimeoutMs,
    storage: {
      deliveryEvents: options.storage.deliveryEvents,
    },
  });

  return worker.runOnce({
    recoverStartupState: options.recoverStartupState,
  });
}
