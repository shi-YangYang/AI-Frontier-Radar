import type { Prisma, PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type {
  CreateDeliveryTargetInput,
  DefaultDeliveryTargetInput,
  DeliveryTarget,
  UpdateDeliveryTargetInput,
} from './types';

const DEFAULT_CHANNEL_TYPE = 'feishu_webhook';

export interface DeleteDeliveryTargetResult {
  deadEventsCount: number;
  deleted: boolean;
}

export interface DeliveryTargetPaginationInput {
  page: number;
  pageSize: number;
}

export interface DeliveryTargetSummary {
  enabled: number;
  total: number;
}

export class DeliveryTargetRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: CreateDeliveryTargetInput): Promise<DeliveryTarget> {
    const now = createTimestamp();
    const deliveryTarget = await this.prisma.deliveryTarget.create({
      data: {
        channelType: input.channelType ?? DEFAULT_CHANNEL_TYPE,
        createdAt: now,
        displayName: input.displayName,
        enabled: input.enabled ?? true,
        id: input.id ?? createDatabaseId(),
        targetKey: input.targetKey,
        updatedAt: now,
        webhookUrl: input.webhookUrl,
      },
    });

    return mapDeliveryTarget(deliveryTarget);
  }

  public async delete(id: string): Promise<DeleteDeliveryTargetResult> {
    const deliveryTarget = await this.prisma.deliveryTarget.findUnique({
      where: { id },
    });

    if (deliveryTarget === null) {
      return {
        deadEventsCount: 0,
        deleted: false,
      };
    }

    const deadEventsResult = await this.prisma.deliveryEvent.updateMany({
      data: {
        lastError: 'target deleted',
        lockedAt: null,
        nextRetryAt: null,
        status: 'dead',
        updatedAt: createTimestamp(),
      },
      where: {
        status: {
          in: ['pending', 'retry_wait', 'sending'],
        },
        targetKey: deliveryTarget.targetKey,
      },
    });

    const deliveryEventCount = await this.prisma.deliveryEvent.count({
      where: {
        targetKey: deliveryTarget.targetKey,
      },
    });

    if (deliveryEventCount === 0) {
      const result = await this.prisma.deliveryTarget.deleteMany({
        where: { id },
      });

      return {
        deadEventsCount: deadEventsResult.count,
        deleted: result.count > 0,
      };
    }

    const result = await this.prisma.deliveryTarget.updateMany({
      data: {
        displayName: `[deleted] ${deliveryTarget.displayName}`,
        enabled: false,
        updatedAt: createTimestamp(),
        webhookUrl: '',
      },
      where: { id },
    });

    return {
      deadEventsCount: deadEventsResult.count,
      deleted: result.count > 0,
    };
  }

  public async ensureDefaultTarget(input: DefaultDeliveryTargetInput): Promise<DeliveryTarget> {
    return this.upsertByTargetKey({
      channelType: DEFAULT_CHANNEL_TYPE,
      displayName: input.displayName ?? `Feishu Webhook (${input.targetKey})`,
      enabled: true,
      targetKey: input.targetKey,
      webhookUrl: input.webhookUrl,
    });
  }

  public async createDefaultTargetIfWebhookConfigured(
    input: DefaultDeliveryTargetInput,
  ): Promise<DeliveryTarget | null> {
    const existingTarget = await this.findByTargetKey(input.targetKey);

    if (existingTarget !== null) {
      return existingTarget;
    }

    if (input.webhookUrl.trim().length === 0) {
      return null;
    }

    return this.create({
      channelType: DEFAULT_CHANNEL_TYPE,
      displayName: input.displayName ?? `Feishu Webhook (${input.targetKey})`,
      enabled: true,
      targetKey: input.targetKey,
      webhookUrl: input.webhookUrl,
    });
  }

  public async findById(id: string): Promise<DeliveryTarget | null> {
    const deliveryTarget = await this.prisma.deliveryTarget.findUnique({
      where: { id },
    });

    return deliveryTarget === null ? null : mapDeliveryTarget(deliveryTarget);
  }

  public async findByTargetKey(targetKey: string): Promise<DeliveryTarget | null> {
    const deliveryTarget = await this.prisma.deliveryTarget.findUnique({
      where: { targetKey },
    });

    return deliveryTarget === null ? null : mapDeliveryTarget(deliveryTarget);
  }

  public async listEnabled(): Promise<DeliveryTarget[]> {
    const deliveryTargets = await this.prisma.deliveryTarget.findMany({
      orderBy: { targetKey: 'asc' },
      where: {
        enabled: true,
        webhookUrl: {
          not: '',
        },
      },
    });

    return deliveryTargets.map(mapDeliveryTarget);
  }

  public async listAll(): Promise<DeliveryTarget[]> {
    const deliveryTargets = await this.prisma.deliveryTarget.findMany({
      orderBy: [
        { createdAt: 'asc' },
        { targetKey: 'asc' },
      ],
      where: {
        webhookUrl: {
          not: '',
        },
      },
    });

    return deliveryTargets.map(mapDeliveryTarget);
  }

  public async listPage(input: DeliveryTargetPaginationInput): Promise<DeliveryTarget[]> {
    const deliveryTargets = await this.prisma.deliveryTarget.findMany({
      orderBy: [
        { createdAt: 'asc' },
        { targetKey: 'asc' },
      ],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      where: visibleDeliveryTargetWhere(),
    });

    return deliveryTargets.map(mapDeliveryTarget);
  }

  public async getVisibleSummary(): Promise<DeliveryTargetSummary> {
    const [total, enabled] = await Promise.all([
      this.prisma.deliveryTarget.count({
        where: visibleDeliveryTargetWhere(),
      }),
      this.prisma.deliveryTarget.count({
        where: {
          ...visibleDeliveryTargetWhere(),
          enabled: true,
        },
      }),
    ]);

    return {
      enabled,
      total,
    };
  }

  public async update(id: string, input: UpdateDeliveryTargetInput): Promise<DeliveryTarget | null> {
    const data = toDeliveryTargetUpdateData(input);

    if (Object.keys(data).length === 0) {
      return this.findById(id);
    }

    const result = await this.prisma.deliveryTarget.updateMany({
      data: {
        ...data,
        updatedAt: createTimestamp(),
      },
      where: { id },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(id);
  }

  public async upsertByTargetKey(input: CreateDeliveryTargetInput): Promise<DeliveryTarget> {
    const now = createTimestamp();
    const deliveryTarget = await this.prisma.deliveryTarget.upsert({
      create: {
        channelType: input.channelType ?? DEFAULT_CHANNEL_TYPE,
        createdAt: now,
        displayName: input.displayName,
        enabled: input.enabled ?? true,
        id: input.id ?? createDatabaseId(),
        targetKey: input.targetKey,
        updatedAt: now,
        webhookUrl: input.webhookUrl,
      },
      update: {
        ...toDeliveryTargetUpdateData(input),
        updatedAt: createTimestamp(),
      },
      where: {
        targetKey: input.targetKey,
      },
    });

    return mapDeliveryTarget(deliveryTarget);
  }
}

function visibleDeliveryTargetWhere(): Prisma.DeliveryTargetWhereInput {
  return {
    webhookUrl: {
      not: '',
    },
  };
}

function mapDeliveryTarget(
  deliveryTarget: Prisma.DeliveryTargetGetPayload<Record<string, never>>,
): DeliveryTarget {
  return {
    channelType: deliveryTarget.channelType as DeliveryTarget['channelType'],
    createdAt: deliveryTarget.createdAt,
    displayName: deliveryTarget.displayName,
    enabled: deliveryTarget.enabled,
    id: deliveryTarget.id,
    targetKey: deliveryTarget.targetKey,
    updatedAt: deliveryTarget.updatedAt,
    webhookUrl: deliveryTarget.webhookUrl,
  };
}

function toDeliveryTargetUpdateData(
  input: UpdateDeliveryTargetInput | CreateDeliveryTargetInput,
): Prisma.DeliveryTargetUpdateInput {
  const data: Prisma.DeliveryTargetUpdateInput = {};

  if (input.channelType !== undefined) {
    data.channelType = input.channelType;
  }
  if (input.displayName !== undefined) {
    data.displayName = input.displayName;
  }
  if (input.webhookUrl !== undefined) {
    data.webhookUrl = input.webhookUrl;
  }
  if (input.enabled !== undefined) {
    data.enabled = input.enabled;
  }

  return data;
}
