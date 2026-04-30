import { Prisma, type PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type { CreateDeliveryEventInput, DeliveryEvent, UpdateDeliveryEventInput } from './types';

export class DeliveryEventRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createIfAbsent(
    input: CreateDeliveryEventInput,
  ): Promise<{ created: boolean; event: DeliveryEvent }> {
    try {
      const event = await this.create(input);

      return {
        created: true,
        event,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existingEvent = await this.findByPostAndTarget(input.xPostId, input.targetKey);

        if (existingEvent !== null) {
          return {
            created: false,
            event: existingEvent,
          };
        }
      }

      throw error;
    }
  }

  public async create(input: CreateDeliveryEventInput): Promise<DeliveryEvent> {
    const now = createTimestamp();
    const deliveryEvent = await this.prisma.deliveryEvent.create({
      data: {
        attemptCount: input.attemptCount ?? 0,
        createdAt: now,
        id: input.id ?? createDatabaseId(),
        lastError: input.lastError ?? null,
        lockedAt: input.lockedAt ?? null,
        nextRetryAt: input.nextRetryAt ?? null,
        sentAt: input.sentAt ?? null,
        status: input.status ?? 'pending',
        targetKey: input.targetKey,
        updatedAt: now,
        xPostId: input.xPostId,
      },
    });

    return mapDeliveryEvent(deliveryEvent);
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.prisma.deliveryEvent.deleteMany({
      where: { id },
    });

    return result.count > 0;
  }

  public async findById(id: string): Promise<DeliveryEvent | null> {
    const deliveryEvent = await this.prisma.deliveryEvent.findUnique({
      where: { id },
    });

    return deliveryEvent === null ? null : mapDeliveryEvent(deliveryEvent);
  }

  public async findByPostAndTarget(xPostId: string, targetKey: string): Promise<DeliveryEvent | null> {
    const deliveryEvent = await this.prisma.deliveryEvent.findUnique({
      where: {
        xPostId_targetKey: {
          targetKey,
          xPostId,
        },
      },
    });

    return deliveryEvent === null ? null : mapDeliveryEvent(deliveryEvent);
  }

  public async claimDueForSending(id: string, referenceTime: string): Promise<DeliveryEvent | null> {
    const result = await this.prisma.deliveryEvent.updateMany({
      data: {
        lockedAt: referenceTime,
        nextRetryAt: null,
        status: 'sending',
        updatedAt: createTimestamp(),
      },
      where: {
        id,
        OR: [
          { status: 'pending' },
          {
            AND: [
              { status: 'retry_wait' },
              {
                OR: [
                  { nextRetryAt: null },
                  { nextRetryAt: { lte: referenceTime } },
                ],
              },
            ],
          },
        ],
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(id);
  }

  public async listPendingForRetry(referenceTime: string): Promise<DeliveryEvent[]> {
    const deliveryEvents = await this.prisma.deliveryEvent.findMany({
      orderBy: { createdAt: 'asc' },
      where: {
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: referenceTime } },
        ],
        status: {
          in: ['pending', 'retry_wait'],
        },
      },
    });

    return deliveryEvents.map(mapDeliveryEvent);
  }

  public async restoreTimedOutSending(
    input: {
      cutoffLockedAt: string;
      nextRetryAt: string;
    },
  ): Promise<number> {
    const result = await this.prisma.deliveryEvent.updateMany({
      data: {
        lockedAt: null,
        nextRetryAt: input.nextRetryAt,
        status: 'retry_wait',
        updatedAt: createTimestamp(),
      },
      where: {
        OR: [
          { lockedAt: null },
          { lockedAt: { lte: input.cutoffLockedAt } },
        ],
        status: 'sending',
      },
    });

    return result.count;
  }

  public async updateSendingFailure(
    id: string,
    input: {
      attemptCount: number;
      lastError: string;
      nextRetryAt: string | null;
      status: 'dead' | 'retry_wait';
    },
  ): Promise<DeliveryEvent | null> {
    const result = await this.prisma.deliveryEvent.updateMany({
      data: {
        attemptCount: input.attemptCount,
        lastError: input.lastError,
        lockedAt: null,
        nextRetryAt: input.nextRetryAt,
        status: input.status,
        updatedAt: createTimestamp(),
      },
      where: {
        id,
        status: 'sending',
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(id);
  }

  public async updateSendingSuccess(
    id: string,
    input: {
      attemptCount: number;
      sentAt: string;
    },
  ): Promise<DeliveryEvent | null> {
    const result = await this.prisma.deliveryEvent.updateMany({
      data: {
        attemptCount: input.attemptCount,
        lastError: null,
        lockedAt: null,
        nextRetryAt: null,
        sentAt: input.sentAt,
        status: 'sent',
        updatedAt: createTimestamp(),
      },
      where: {
        id,
        status: 'sending',
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(id);
  }

  public async update(id: string, input: UpdateDeliveryEventInput): Promise<DeliveryEvent | null> {
    const data = toDeliveryEventUpdateData(input);

    if (Object.keys(data).length === 0) {
      return this.findById(id);
    }

    const result = await this.prisma.deliveryEvent.updateMany({
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

  public async upsertByPostAndTarget(input: CreateDeliveryEventInput): Promise<DeliveryEvent> {
    const now = createTimestamp();
    const deliveryEvent = await this.prisma.deliveryEvent.upsert({
      create: {
        attemptCount: input.attemptCount ?? 0,
        createdAt: now,
        id: input.id ?? createDatabaseId(),
        lastError: input.lastError ?? null,
        lockedAt: input.lockedAt ?? null,
        nextRetryAt: input.nextRetryAt ?? null,
        sentAt: input.sentAt ?? null,
        status: input.status ?? 'pending',
        targetKey: input.targetKey,
        updatedAt: now,
        xPostId: input.xPostId,
      },
      update: {},
      where: {
        xPostId_targetKey: {
          targetKey: input.targetKey,
          xPostId: input.xPostId,
        },
      },
    });

    return mapDeliveryEvent(deliveryEvent);
  }
}

function mapDeliveryEvent(
  deliveryEvent: Prisma.DeliveryEventGetPayload<Record<string, never>>,
): DeliveryEvent {
  return {
    attemptCount: deliveryEvent.attemptCount,
    createdAt: deliveryEvent.createdAt,
    id: deliveryEvent.id,
    lastError: deliveryEvent.lastError,
    lockedAt: deliveryEvent.lockedAt,
    nextRetryAt: deliveryEvent.nextRetryAt,
    sentAt: deliveryEvent.sentAt,
    status: deliveryEvent.status as DeliveryEvent['status'],
    targetKey: deliveryEvent.targetKey,
    updatedAt: deliveryEvent.updatedAt,
    xPostId: deliveryEvent.xPostId,
  };
}

function toDeliveryEventUpdateData(
  input: UpdateDeliveryEventInput,
): Prisma.DeliveryEventUpdateInput {
  const data: Prisma.DeliveryEventUpdateInput = {};

  if (input.status !== undefined) {
    data.status = input.status;
  }
  if (input.attemptCount !== undefined) {
    data.attemptCount = input.attemptCount;
  }
  if (input.nextRetryAt !== undefined) {
    data.nextRetryAt = input.nextRetryAt;
  }
  if (input.lastError !== undefined) {
    data.lastError = input.lastError;
  }
  if (input.lockedAt !== undefined) {
    data.lockedAt = input.lockedAt;
  }
  if (input.sentAt !== undefined) {
    data.sentAt = input.sentAt;
  }

  return data;
}
