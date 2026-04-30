import type { Prisma, PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type { CreateXPostRawInput, XPostRaw } from './types';

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
