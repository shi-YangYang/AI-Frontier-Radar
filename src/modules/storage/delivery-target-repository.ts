import type { Prisma, PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type {
  CreateDeliveryTargetInput,
  DefaultDeliveryTargetInput,
  DeliveryTarget,
  UpdateDeliveryTargetInput,
} from './types';

const DEFAULT_CHANNEL_TYPE = 'feishu_webhook';

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

  public async delete(id: string): Promise<boolean> {
    const result = await this.prisma.deliveryTarget.deleteMany({
      where: { id },
    });

    return result.count > 0;
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
      where: { enabled: true },
    });

    return deliveryTargets.map(mapDeliveryTarget);
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
