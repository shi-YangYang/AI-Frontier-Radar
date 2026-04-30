import type { AppLogger } from '../../../lib/logger';
import type { DeliveryEventRepository, DeliveryTargetRepository, XPostRepository } from '../../storage';
import type { FeishuWebhookClient, FeishuWebhookSendResult } from '../channel';
import type { V1TextMessageFormatter } from '../formatter';
import { DeliveryRetryPolicy, createDeliveryRetryPolicy } from './delivery-retry-policy';

export type DeliveryEventProcessStatus =
  | 'dead'
  | 'not_found'
  | 'sent'
  | 'skipped'
  | 'retry_wait';

export interface DeliveryEventProcessResult {
  eventId: string;
  reason?: string;
  status: DeliveryEventProcessStatus;
}

export interface DeliveryEventProcessorOptions {
  feishuClient: FeishuWebhookClient;
  formatter: V1TextMessageFormatter;
  logger?: AppLogger;
  retryPolicy?: DeliveryRetryPolicy;
  storage: {
    deliveryEvents: DeliveryEventRepository;
    deliveryTargets: DeliveryTargetRepository;
    xPosts: XPostRepository;
  };
}

const LAST_ERROR_MAX_LENGTH = 2_000;

export class DeliveryEventProcessor {
  private readonly retryPolicy: DeliveryRetryPolicy;

  public constructor(private readonly options: DeliveryEventProcessorOptions) {
    this.retryPolicy = options.retryPolicy ?? createDeliveryRetryPolicy();
  }

  public async processEvent(eventId: string): Promise<DeliveryEventProcessResult> {
    const now = new Date();
    const claimedEvent = await this.options.storage.deliveryEvents.claimDueForSending(
      eventId,
      now.toISOString(),
    );

    if (claimedEvent === null) {
      return this.resolveUnclaimedEvent(eventId);
    }

    try {
      const xPost = await this.options.storage.xPosts.findByXPostId(claimedEvent.xPostId);

      if (xPost === null) {
        return this.recordFailure(claimedEvent, {
          message: `X post ${claimedEvent.xPostId} was not found for delivery event ${claimedEvent.id}.`,
          retryable: false,
        });
      }

      const target = await this.options.storage.deliveryTargets.findByTargetKey(claimedEvent.targetKey);

      if (target === null) {
        return this.recordFailure(claimedEvent, {
          message: `Delivery target ${claimedEvent.targetKey} was not found.`,
          retryable: false,
        });
      }

      if (!target.enabled) {
        return this.recordFailure(claimedEvent, {
          message: `Delivery target ${claimedEvent.targetKey} is disabled.`,
          retryable: true,
        });
      }

      if (target.channelType !== 'feishu_webhook') {
        return this.recordFailure(claimedEvent, {
          message: `Unsupported delivery channel type ${target.channelType}.`,
          retryable: false,
        });
      }

      const message = this.options.formatter.format({
        authorUsername: xPost.authorUsername,
        permalinkUrl: xPost.permalinkUrl,
        postedAt: xPost.postedAt,
        textContent: xPost.textContent,
      });
      const sendResult = await this.options.feishuClient.sendTextMessage({
        targetKey: target.targetKey,
        text: message.text,
        webhookUrl: target.webhookUrl,
      });

      if (!sendResult.ok) {
        return this.recordFailure(claimedEvent, {
          message: formatSendFailure(sendResult),
          retryable: sendResult.error.retryable,
        });
      }

      const sentAt = new Date().toISOString();
      const updatedEvent = await this.options.storage.deliveryEvents.updateSendingSuccess(
        claimedEvent.id,
        {
          attemptCount: claimedEvent.attemptCount + 1,
          sentAt,
        },
      );

      if (updatedEvent === null) {
        this.options.logger?.warn(
          { deliveryEventId: claimedEvent.id },
          'delivery event was sent but could not be marked as sent',
        );
      }

      return {
        eventId,
        status: 'sent',
      };
    } catch (error) {
      return this.recordFailure(claimedEvent, {
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
    }
  }

  private async recordFailure(
    event: {
      attemptCount: number;
      id: string;
    },
    failure: {
      message: string;
      retryable: boolean;
    },
  ): Promise<DeliveryEventProcessResult> {
    const now = new Date();
    const nextAttemptCount = event.attemptCount + 1;
    const retryDecision = this.retryPolicy.decide({
      attemptCountAfterFailure: nextAttemptCount,
      now,
      retryable: failure.retryable,
    });
    const updatedEvent = await this.options.storage.deliveryEvents.updateSendingFailure(
      event.id,
      {
        attemptCount: nextAttemptCount,
        lastError: truncateLastError(failure.message),
        nextRetryAt: retryDecision.nextRetryAt,
        status: retryDecision.status,
      },
    );

    if (updatedEvent === null) {
      this.options.logger?.warn(
        { deliveryEventId: event.id },
        'delivery event failure could not be recorded because it is no longer sending',
      );
    }

    return {
      eventId: event.id,
      reason: failure.message,
      status: retryDecision.status,
    };
  }

  private async resolveUnclaimedEvent(eventId: string): Promise<DeliveryEventProcessResult> {
    const event = await this.options.storage.deliveryEvents.findById(eventId);

    if (event === null) {
      return {
        eventId,
        reason: 'delivery event not found',
        status: 'not_found',
      };
    }

    return {
      eventId,
      reason: `delivery event is ${event.status}`,
      status: event.status === 'sent' || event.status === 'dead' ? 'skipped' : 'skipped',
    };
  }
}

export function createDeliveryEventProcessor(
  options: DeliveryEventProcessorOptions,
): DeliveryEventProcessor {
  return new DeliveryEventProcessor(options);
}

function formatSendFailure(result: Extract<FeishuWebhookSendResult, { ok: false }>): string {
  const diagnostics = JSON.stringify(result.error.diagnostics);

  return `${result.error.code}: ${result.error.message}; diagnostics=${diagnostics}`;
}

function truncateLastError(value: string): string {
  if (value.length <= LAST_ERROR_MAX_LENGTH) {
    return value;
  }

  return value.slice(0, LAST_ERROR_MAX_LENGTH);
}
