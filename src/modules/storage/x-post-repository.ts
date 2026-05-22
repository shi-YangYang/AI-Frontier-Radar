import type { Prisma, PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type {
  CreateXPostRawInput,
  DeliveryEvent,
  XPostPageQuery,
  XPostRaw,
  XPostRawWithDeliveryEvents,
  XPostSummary,
} from './types';

export class XPostRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: CreateXPostRawInput): Promise<XPostRaw> {
    const createdAt = createTimestamp();
    const xPost = await this.prisma.xPostRaw.create({
      data: {
        authorUserId: input.authorUserId ?? null,
        authorUsername: input.authorUsername,
        createdAt,
        detectedAt: input.detectedAt ?? createdAt,
        id: input.id ?? createDatabaseId(),
        isReply: input.isReply ?? false,
        isRepost: input.isRepost ?? false,
        permalinkUrl: input.permalinkUrl,
        postedAt: input.postedAt,
        rawPayloadJson: input.rawPayloadJson,
        textContent: input.textContent,
        xPostId: input.xPostId,
      },
    });

    return mapXPostRaw(xPost);
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.prisma.xPostRaw.deleteMany({
      where: { id },
    });

    return result.count > 0;
  }

  public async findById(id: string): Promise<XPostRaw | null> {
    const xPost = await this.prisma.xPostRaw.findUnique({
      where: { id },
    });

    return xPost === null ? null : mapXPostRaw(xPost);
  }

  public async findByXPostId(xPostId: string): Promise<XPostRaw | null> {
    const xPost = await this.prisma.xPostRaw.findUnique({
      where: { xPostId },
    });

    return xPost === null ? null : mapXPostRaw(xPost);
  }

  public async listByAuthorUsername(authorUsername: string, limit = 50): Promise<XPostRaw[]> {
    const xPosts = await this.prisma.xPostRaw.findMany({
      orderBy: {
        postedAt: 'desc',
      },
      take: limit,
      where: {
        authorUsername,
      },
    });

    return xPosts.map(mapXPostRaw);
  }

  public async listPage(input: XPostPageQuery): Promise<XPostRawWithDeliveryEvents[]> {
    const xPosts = await this.prisma.xPostRaw.findMany({
      include: {
        deliveryEvents: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: {
        detectedAt: 'desc',
      },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      where: toXPostWhereInput(input),
    });

    return xPosts.map(mapXPostRawWithDeliveryEvents);
  }

  public async countAll(input: Partial<XPostPageQuery> = {}): Promise<number> {
    return this.prisma.xPostRaw.count({
      where: toXPostWhereInput(input),
    });
  }

  public async getSummary(): Promise<XPostSummary> {
    const todayStart = getLocalDayStartIsoString(new Date());
    const [totalPosts, todayPosts, latestPost] = await this.prisma.$transaction([
      this.prisma.xPostRaw.count(),
      this.prisma.xPostRaw.count({
        where: {
          detectedAt: {
            gte: todayStart,
          },
        },
      }),
      this.prisma.xPostRaw.findFirst({
        orderBy: {
          detectedAt: 'desc',
        },
        select: {
          detectedAt: true,
        },
      }),
    ]);

    return {
      latestDetectedAt: latestPost?.detectedAt ?? null,
      todayPosts,
      totalPosts,
    };
  }

  public async upsertByXPostId(input: CreateXPostRawInput): Promise<XPostRaw> {
    const createdAt = createTimestamp();
    const xPost = await this.prisma.xPostRaw.upsert({
      create: {
        authorUserId: input.authorUserId ?? null,
        authorUsername: input.authorUsername,
        createdAt,
        detectedAt: input.detectedAt ?? createdAt,
        id: input.id ?? createDatabaseId(),
        isReply: input.isReply ?? false,
        isRepost: input.isRepost ?? false,
        permalinkUrl: input.permalinkUrl,
        postedAt: input.postedAt,
        rawPayloadJson: input.rawPayloadJson,
        textContent: input.textContent,
        xPostId: input.xPostId,
      },
      update: {},
      where: {
        xPostId: input.xPostId,
      },
    });

    return mapXPostRaw(xPost);
  }
}

function mapXPostRaw(xPost: Prisma.XPostRawGetPayload<Record<string, never>>): XPostRaw {
  return {
    authorUserId: xPost.authorUserId,
    authorUsername: xPost.authorUsername,
    createdAt: xPost.createdAt,
    detectedAt: xPost.detectedAt,
    id: xPost.id,
    isReply: xPost.isReply,
    isRepost: xPost.isRepost,
    permalinkUrl: xPost.permalinkUrl,
    postedAt: xPost.postedAt,
    rawPayloadJson: xPost.rawPayloadJson,
    textContent: xPost.textContent,
    xPostId: xPost.xPostId,
  };
}

function mapXPostRawWithDeliveryEvents(
  xPost: Prisma.XPostRawGetPayload<{ include: { deliveryEvents: true } }>,
): XPostRawWithDeliveryEvents {
  return {
    ...mapXPostRaw(xPost),
    deliveryEvents: xPost.deliveryEvents.map(mapDeliveryEvent),
  };
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

function toXPostWhereInput(input: Partial<XPostPageQuery>): Prisma.XPostRawWhereInput {
  return {
    ...(input.authorUsername === undefined
      ? {}
      : {
          authorUsername: {
            contains: input.authorUsername,
          },
        }),
    ...(input.query === undefined
      ? {}
      : {
          textContent: {
            contains: input.query,
          },
        }),
    ...(input.postedFrom === undefined && input.postedTo === undefined
      ? {}
      : {
          postedAt: {
            ...(input.postedFrom === undefined ? {} : { gte: input.postedFrom }),
            ...(input.postedTo === undefined ? {} : { lte: input.postedTo }),
          },
        }),
    ...(input.detectedFrom === undefined && input.detectedTo === undefined
      ? {}
      : {
          detectedAt: {
            ...(input.detectedFrom === undefined ? {} : { gte: input.detectedFrom }),
            ...(input.detectedTo === undefined ? {} : { lte: input.detectedTo }),
          },
        }),
    ...(input.isReply === undefined ? {} : { isReply: input.isReply }),
    ...(input.isRepost === undefined ? {} : { isRepost: input.isRepost }),
  };
}

function getLocalDayStartIsoString(date: Date): string {
  const localDayStart = new Date(date);
  localDayStart.setHours(0, 0, 0, 0);
  return localDayStart.toISOString();
}
