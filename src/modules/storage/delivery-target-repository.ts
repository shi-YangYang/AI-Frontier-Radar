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
  excludeChannelTypes?: string[];
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
        configJson: serializeDeliveryTargetConfig(input.config),
        createdAt: now,
        displayName: input.displayName,
        enabled: input.enabled ?? true,
        id: input.id ?? createDatabaseId(),
        ownerUserId: input.ownerUserId ?? null,
        targetKey: input.targetKey,
        updatedAt: now,
        webhookUrl: input.webhookUrl,
      },
    });

    return mapDeliveryTarget(deliveryTarget);
  }

  public async clearOwner(userId: string): Promise<number> {
    const result = await this.prisma.deliveryTarget.updateMany({
      data: { ownerUserId: null },
      where: { ownerUserId: userId },
    });

    return result.count;
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
      where: visibleDeliveryTargetWhere(input.excludeChannelTypes),
    });

    return deliveryTargets.map(mapDeliveryTarget);
  }

  public async getVisibleSummary(
    input: { excludeChannelTypes?: string[] } = {},
  ): Promise<DeliveryTargetSummary> {
    const [total, enabled] = await Promise.all([
      this.prisma.deliveryTarget.count({
        where: visibleDeliveryTargetWhere(input.excludeChannelTypes),
      }),
      this.prisma.deliveryTarget.count({
        where: {
          ...visibleDeliveryTargetWhere(input.excludeChannelTypes),
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
        ownerUserId: input.ownerUserId ?? null,
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

  /** 删除主题包后清理所有投递通道 config 中悬空的 packId，返回此前引用该包的通道数。 */
  public async removePackIdFromTargets(packId: string): Promise<number> {
    const deliveryTargets = await this.prisma.deliveryTarget.findMany({
      orderBy: { id: 'asc' },
    });
    let affectedCount = 0;

    for (const deliveryTarget of deliveryTargets) {
      const config = parseDeliveryTargetConfig(deliveryTarget.configJson);

      if (config.packIds === undefined || !config.packIds.includes(packId)) {
        continue;
      }

      affectedCount += 1;
      const remainingPackIds = config.packIds.filter((entry) => entry !== packId);
      const nextConfig = { ...config };

      if (remainingPackIds.length === 0) {
        delete nextConfig.packIds;
      } else {
        nextConfig.packIds = remainingPackIds;
      }

      await this.prisma.deliveryTarget.update({
        data: {
          configJson: serializeDeliveryTargetConfig(nextConfig),
          updatedAt: createTimestamp(),
        },
        where: { id: deliveryTarget.id },
      });
    }

    return affectedCount;
  }
}

function visibleDeliveryTargetWhere(
  excludeChannelTypes?: string[],
): Prisma.DeliveryTargetWhereInput {
  return {
    webhookUrl: {
      not: '',
    },
    ...(excludeChannelTypes === undefined || excludeChannelTypes.length === 0
      ? {}
      : { channelType: { notIn: excludeChannelTypes } }),
  };
}

function mapDeliveryTarget(
  deliveryTarget: Prisma.DeliveryTargetGetPayload<Record<string, never>>,
): DeliveryTarget {
  return {
    channelType: deliveryTarget.channelType as DeliveryTarget['channelType'],
    config: parseDeliveryTargetConfig(deliveryTarget.configJson),
    createdAt: deliveryTarget.createdAt,
    displayName: deliveryTarget.displayName,
    enabled: deliveryTarget.enabled,
    id: deliveryTarget.id,
    ownerUserId: deliveryTarget.ownerUserId,
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
  if (input.config !== undefined) {
    data.configJson = serializeDeliveryTargetConfig(input.config);
  }
  if (input.ownerUserId !== undefined) {
    data.ownerUserId = input.ownerUserId;
  }

  return data;
}

function parseDeliveryTargetConfig(rawConfigJson: string): DeliveryTarget['config'] {
  try {
    const parsed = JSON.parse(rawConfigJson) as unknown;

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    const record = parsed as Record<string, unknown>;
    const secret = typeof record.secret === 'string' ? record.secret.trim() : '';
    const target = typeof record.target === 'string' ? record.target.trim() : '';
    const accountId = typeof record.accountId === 'string' ? record.accountId.trim() : '';
    const sourceIds = normalizeSourceIds(record.sourceIds);
    const packIds = normalizePackIds(record.packIds);
    const quietHours = normalizeQuietHours(record.quietHours);

    return {
      ...(accountId.length === 0 ? {} : { accountId }),
      ...(quietHours === undefined ? {} : { quietHours }),
      ...(secret.length === 0 ? {} : { secret }),
      ...(sourceIds.length === 0 ? {} : { sourceIds }),
      ...(target.length === 0 ? {} : { target }),
      // packIds 用「字段存在」表达按包模式：空数组 = 按包且未选包（不推送），不能丢弃。
      ...(packIds === undefined ? {} : { packIds }),
    };
  } catch {
    return {};
  }
}

function serializeDeliveryTargetConfig(config: DeliveryTarget['config'] | undefined): string {
  const secret = config?.secret?.trim() ?? '';
  const target = config?.target?.trim() ?? '';
  const accountId = config?.accountId?.trim() ?? '';
  const sourceIds = normalizeSourceIds(config?.sourceIds);
  const packIds = normalizePackIds(config?.packIds);
  const quietHours = config?.quietHours;

  return JSON.stringify({
    ...(accountId.length === 0 ? {} : { accountId }),
    ...(quietHours === undefined ? {} : { quietHours }),
    ...(secret.length === 0 ? {} : { secret }),
    ...(sourceIds.length === 0 ? {} : { sourceIds }),
    ...(packIds === undefined ? {} : { packIds }),
    ...(target.length === 0 ? {} : { target }),
  });
}

function normalizeSourceIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());

  return [...new Set(normalized)];
}

function normalizePackIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());

  return [...new Set(normalized)];
}

function normalizeQuietHours(value: unknown): DeliveryTarget['config']['quietHours'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  if (record.enabled !== true) {
    return undefined;
  }

  return {
    enabled: true,
    endHour: normalizeHour(record.endHour, 8),
    startHour: normalizeHour(record.startHour, 23),
  };
}

function normalizeHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 23) {
    return fallback;
  }

  return value;
}
