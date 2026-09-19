import type { AppLogger } from '../../../lib/logger';
import type { DeliveryEventRepository, DeliveryTargetRepository, XPostRepository } from '../../storage';
import type { DeliveryEvent, DeliveryTarget } from '../../storage/types';
import type { DeliveryChannelRegistry, DeliveryChannelSender, DeliveryChannelSendResult } from '../channel';
import type { V1TextMessageFormatter } from '../formatter';
import { DeliveryRetryPolicy, createDeliveryRetryPolicy } from './delivery-retry-policy';
import { isWithinQuietHours, resolveQuietHoursWindow } from './quiet-hours';

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
  channels: DeliveryChannelRegistry;
  formatter: V1TextMessageFormatter;
  logger?: AppLogger;
  now?: () => Date;
  retryPolicy?: DeliveryRetryPolicy;
  storage: {
    deliveryEvents: DeliveryEventRepository;
    deliveryTargets: DeliveryTargetRepository;
    xPosts: XPostRepository;
  };
}

const LAST_ERROR_MAX_LENGTH = 2_000;

export class DeliveryEventProcessor {
  private readonly now: () => Date;
  private readonly retryPolicy: DeliveryRetryPolicy;

  public constructor(private readonly options: DeliveryEventProcessorOptions) {
    this.now = options.now ?? (() => new Date());
    this.retryPolicy = options.retryPolicy ?? createDeliveryRetryPolicy();
  }

  public async processEvent(eventId: string): Promise<DeliveryEventProcessResult> {
    const now = this.now();
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

      const channelSender = this.options.channels.get(target.channelType);

      if (channelSender === undefined) {
        return this.recordFailure(claimedEvent, {
          message: `Unsupported delivery channel type ${target.channelType}.`,
          retryable: false,
        });
      }

      const quietWindow = resolveQuietHoursWindow(target.config);

      if (quietWindow !== null) {
        if (isWithinQuietHours(now, quietWindow)) {
          await this.options.storage.deliveryEvents.releaseToPending(claimedEvent.id);
          this.options.logger?.info?.(
            {
              deliveryEventId: claimedEvent.id,
              quietHours: quietWindow,
              targetKey: target.targetKey,
            },
            '夜间静默：新帖暂缓投递，等待次日汇总',
          );

          return { eventId, reason: 'quiet-hours', status: 'skipped' };
        }

        const digestResult = await this.trySendDigest(claimedEvent, target, channelSender, now);

        if (digestResult !== null) {
          return digestResult;
        }
      }

      const message = this.options.formatter.format({
        authorUsername: xPost.authorUsername,
        permalinkUrl: xPost.permalinkUrl,
        postedAt: xPost.postedAt,
        textContent: xPost.textContent,
        title: xPost.title,
      });
      const sendResult = await channelSender.send({
        config: target.config,
        message: {
          author: xPost.authorUsername,
          postedAt: xPost.postedAt,
          text: message.text,
          title: message.title,
          url: xPost.permalinkUrl,
        },
        targetKey: target.targetKey,
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
          '投递事件已发送，但未能标记为已发送',
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

  private async trySendDigest(
    claimedEvent: DeliveryEvent,
    target: DeliveryTarget,
    channelSender: DeliveryChannelSender,
    now: Date,
  ): Promise<DeliveryEventProcessResult | null> {
    const pendingEvents = await this.options.storage.deliveryEvents.listPendingByTargetKey(
      target.targetKey,
    );

    if (pendingEvents.length === 0) {
      return null;
    }

    const claimedOthers: DeliveryEvent[] = [];

    for (const event of pendingEvents) {
      const claimed = await this.options.storage.deliveryEvents.claimDueForSending(
        event.id,
        now.toISOString(),
      );

      if (claimed !== null) {
        claimedOthers.push(claimed);
      }
    }

    if (claimedOthers.length === 0) {
      return null;
    }

    const events = [claimedEvent, ...claimedOthers];
    const posts: Array<Parameters<V1TextMessageFormatter['formatDigest']>[0][number]> = [];

    for (const event of events) {
      const post = await this.options.storage.xPosts.findByXPostId(event.xPostId);

      if (post !== null) {
        posts.push({
          authorUsername: post.authorUsername,
          permalinkUrl: post.permalinkUrl,
          postedAt: post.postedAt,
          textContent: post.textContent,
          title: post.title,
        });
      }
    }

    if (posts.length === 0) {
      await this.options.storage.deliveryEvents.releaseToPending(claimedEvent.id);

      for (const event of claimedOthers) {
        await this.options.storage.deliveryEvents.releaseToPending(event.id);
      }

      return null;
    }

    const digest = this.options.formatter.formatDigest(posts);
    const sendResult = await channelSender.send({
      config: target.config,
      message: {
        author: 'AI 前沿雷达',
        postedAt: now.toISOString(),
        text: digest.text,
        title: digest.title,
        url: posts[0]?.permalinkUrl ?? '',
      },
      targetKey: target.targetKey,
      webhookUrl: target.webhookUrl,
    });

    if (!sendResult.ok) {
      for (const event of claimedOthers) {
        await this.options.storage.deliveryEvents.releaseToPending(event.id);
      }

      return this.recordFailure(claimedEvent, {
        message: formatSendFailure(sendResult),
        retryable: sendResult.error.retryable,
      });
    }

    const sentAt = new Date().toISOString();

    for (const event of events) {
      await this.options.storage.deliveryEvents.updateSendingSuccess(event.id, {
        attemptCount: event.attemptCount + 1,
        sentAt,
      });
    }

    this.options.logger?.info?.(
      { digestCount: posts.length, targetKey: target.targetKey },
      '夜间静默汇总投递完成',
    );

    return { eventId: claimedEvent.id, reason: `digest:${posts.length}`, status: 'sent' };
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
        '投递失败未能记录（该事件已不在发送中）',
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

function formatSendFailure(result: Extract<DeliveryChannelSendResult, { ok: false }>): string {
  const diagnostics = JSON.stringify(result.error.diagnostics);

  return `${result.error.code}: ${result.error.message}; diagnostics=${diagnostics}`;
}

function truncateLastError(value: string): string {
  if (value.length <= LAST_ERROR_MAX_LENGTH) {
    return value;
  }

  return value.slice(0, LAST_ERROR_MAX_LENGTH);
}
