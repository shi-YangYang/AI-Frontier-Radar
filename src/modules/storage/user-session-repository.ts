import type { PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type { UserSession } from './types';

export class UserSessionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: {
    expiresAt: string;
    id: string;
    userId: string;
  }): Promise<UserSession> {
    const session = await this.prisma.userSession.create({
      data: {
        createdAt: createTimestamp(),
        expiresAt: input.expiresAt,
        id: input.id || createDatabaseId(),
        userId: input.userId,
      },
    });

    return {
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      id: session.id,
      userId: session.userId,
    };
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.prisma.userSession.deleteMany({
      where: { id },
    });

    return result.count > 0;
  }

  public async deleteByUserId(userId: string): Promise<number> {
    const result = await this.prisma.userSession.deleteMany({
      where: { userId },
    });

    return result.count;
  }

  public async deleteExpired(referenceTime: string): Promise<number> {
    const result = await this.prisma.userSession.deleteMany({
      where: {
        expiresAt: {
          lt: referenceTime,
        },
      },
    });

    return result.count;
  }

  public async findById(id: string): Promise<UserSession | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { id },
    });

    if (session === null) {
      return null;
    }

    return {
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      id: session.id,
      userId: session.userId,
    };
  }
}
