import type { Prisma, PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type { CreateUserInput, User, UserRole, UserWithPassword } from './types';

export class UserRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async countAll(): Promise<number> {
    return this.prisma.user.count();
  }

  public async countByRole(role: UserRole): Promise<number> {
    return this.prisma.user.count({
      where: { role },
    });
  }

  public async create(input: CreateUserInput): Promise<User> {
    const now = createTimestamp();
    const user = await this.prisma.user.create({
      data: {
        createdAt: now,
        ...(input.dingtalkUnionId === undefined
          ? {}
          : { dingtalkUnionId: input.dingtalkUnionId }),
        id: input.id ?? createDatabaseId(),
        passwordHash: input.passwordHash,
        role: input.role,
        updatedAt: now,
        username: input.username,
      },
    });

    return mapUser(user);
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.prisma.user.deleteMany({
      where: { id },
    });

    return result.count > 0;
  }

  public async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    return user === null ? null : mapUser(user);
  }

  public async findByUsername(username: string): Promise<UserWithPassword | null> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    return user === null ? null : mapUserWithPassword(user);
  }

  public async findByDingtalkUnionId(unionId: string): Promise<UserWithPassword | null> {
    const user = await this.prisma.user.findUnique({
      where: { dingtalkUnionId: unionId },
    });

    return user === null ? null : mapUserWithPassword(user);
  }

  public async listAll(): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      orderBy: [{ createdAt: 'asc' }],
    });

    return users.map(mapUser);
  }

  public async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      data: {
        passwordHash,
        updatedAt: createTimestamp(),
      },
      where: { id },
    });

    return result.count > 0;
  }
}

function mapUser(user: Prisma.UserGetPayload<Record<string, never>>): User {
  return {
    createdAt: user.createdAt,
    id: user.id,
    role: user.role as UserRole,
    updatedAt: user.updatedAt,
    username: user.username,
  };
}

function mapUserWithPassword(user: Prisma.UserGetPayload<Record<string, never>>): UserWithPassword {
  return {
    ...mapUser(user),
    passwordHash: user.passwordHash,
  };
}
