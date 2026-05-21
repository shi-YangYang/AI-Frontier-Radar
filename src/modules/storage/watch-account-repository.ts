import { Prisma, type PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type { CreateWatchAccountInput, UpdateWatchAccountInput, WatchAccount } from './types';

export class WatchAccountRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createIfAbsentByUsername(
    input: CreateWatchAccountInput,
  ): Promise<{ created: boolean; watchAccount: WatchAccount }> {
    try {
      const watchAccount = await this.create(input);

      return {
        created: true,
        watchAccount,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existingWatchAccount = await this.findByUsername(input.xUsername);

        if (existingWatchAccount !== null) {
          return {
            created: false,
            watchAccount: existingWatchAccount,
          };
        }
      }

      throw error;
    }
  }

  public async create(input: CreateWatchAccountInput): Promise<WatchAccount> {
    const now = createTimestamp();

    const watchAccount = await this.prisma.watchAccount.create({
      data: {
        baselinePostId: input.baselinePostId ?? null,
        createdAt: now,
        displayName: input.displayName ?? null,
        enabled: input.enabled ?? true,
        id: input.id ?? createDatabaseId(),
        lastPollError: input.lastPollError ?? null,
        lastPolledAt: input.lastPolledAt ?? null,
        lastPollStatus: input.lastPollStatus ?? null,
        lastSeenPostId: input.lastSeenPostId ?? null,
        updatedAt: now,
        xUserId: input.xUserId ?? null,
        xUsername: normalizeXUsername(input.xUsername),
      },
    });

    return mapWatchAccount(watchAccount);
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.prisma.watchAccount.deleteMany({
      where: { id },
    });

    return result.count > 0;
  }

  public async findById(id: string): Promise<WatchAccount | null> {
    const watchAccount = await this.prisma.watchAccount.findUnique({
      where: { id },
    });

    return watchAccount === null ? null : mapWatchAccount(watchAccount);
  }

  public async findByUsername(xUsername: string): Promise<WatchAccount | null> {
    const watchAccount = await this.prisma.watchAccount.findUnique({
      where: { xUsername: normalizeXUsername(xUsername) },
    });

    return watchAccount === null ? null : mapWatchAccount(watchAccount);
  }

  public async listAll(): Promise<WatchAccount[]> {
    const watchAccounts = await this.prisma.watchAccount.findMany({
      orderBy: { xUsername: 'asc' },
    });

    return watchAccounts.map(mapWatchAccount);
  }

  public async listPage(input: {
    page: number;
    pageSize: number;
    query?: string;
  }): Promise<WatchAccount[]> {
    const watchAccounts = await this.prisma.watchAccount.findMany({
      orderBy: { xUsername: 'asc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      where: toWatchAccountWhereInput(input),
    });

    return watchAccounts.map(mapWatchAccount);
  }

  public async countAll(input: { query?: string } = {}): Promise<number> {
    return this.prisma.watchAccount.count({
      where: toWatchAccountWhereInput(input),
    });
  }

  public async listEnabled(): Promise<WatchAccount[]> {
    const watchAccounts = await this.prisma.watchAccount.findMany({
      orderBy: { xUsername: 'asc' },
      where: { enabled: true },
    });

    return watchAccounts.map(mapWatchAccount);
  }

  public async disableAccountsExceptUsernames(xUsernames: string[]): Promise<number> {
    const normalizedUsernames = xUsernames.map(normalizeXUsername);
    const result = await this.prisma.watchAccount.updateMany({
      data: {
        enabled: false,
        updatedAt: createTimestamp(),
      },
      where: {
        xUsername: {
          notIn: normalizedUsernames,
        },
      },
    });

    return result.count;
  }

  public async update(id: string, input: UpdateWatchAccountInput): Promise<WatchAccount | null> {
    const data = toWatchAccountUpdateData(input);

    if (Object.keys(data).length === 0) {
      return this.findById(id);
    }

    const result = await this.prisma.watchAccount.updateMany({
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

  public async upsertByUsername(input: CreateWatchAccountInput): Promise<WatchAccount> {
    const now = createTimestamp();
    const watchAccount = await this.prisma.watchAccount.upsert({
      create: {
        baselinePostId: input.baselinePostId ?? null,
        createdAt: now,
        displayName: input.displayName ?? null,
        enabled: input.enabled ?? true,
        id: input.id ?? createDatabaseId(),
        lastPollError: input.lastPollError ?? null,
        lastPolledAt: input.lastPolledAt ?? null,
        lastPollStatus: input.lastPollStatus ?? null,
        lastSeenPostId: input.lastSeenPostId ?? null,
        updatedAt: now,
        xUserId: input.xUserId ?? null,
        xUsername: normalizeXUsername(input.xUsername),
      },
      update: {
        ...toWatchAccountUpdateData(input),
        updatedAt: createTimestamp(),
      },
      where: {
        xUsername: normalizeXUsername(input.xUsername),
      },
    });

    return mapWatchAccount(watchAccount);
  }

  public async upsertSeedByUsername(
    input: Pick<CreateWatchAccountInput, 'enabled' | 'xUsername'>,
  ): Promise<WatchAccount> {
    const now = createTimestamp();
    const watchAccount = await this.prisma.watchAccount.upsert({
      create: {
        createdAt: now,
        enabled: input.enabled ?? true,
        id: createDatabaseId(),
        updatedAt: now,
        xUsername: normalizeXUsername(input.xUsername),
      },
      update: {
        enabled: input.enabled ?? true,
        updatedAt: createTimestamp(),
      },
      where: {
        xUsername: normalizeXUsername(input.xUsername),
      },
    });

    return mapWatchAccount(watchAccount);
  }
}

function mapWatchAccount(
  watchAccount: Prisma.WatchAccountGetPayload<Record<string, never>>,
): WatchAccount {
  return {
    baselinePostId: watchAccount.baselinePostId,
    createdAt: watchAccount.createdAt,
    displayName: watchAccount.displayName,
    enabled: watchAccount.enabled,
    id: watchAccount.id,
    lastPollError: watchAccount.lastPollError,
    lastPolledAt: watchAccount.lastPolledAt,
    lastPollStatus: watchAccount.lastPollStatus as WatchAccount['lastPollStatus'],
    lastSeenPostId: watchAccount.lastSeenPostId,
    updatedAt: watchAccount.updatedAt,
    xUserId: watchAccount.xUserId,
    xUsername: watchAccount.xUsername,
  };
}

export function normalizeXUsername(xUsername: string): string {
  return xUsername.trim().replace(/^@+/, '').toLowerCase();
}

function toWatchAccountWhereInput(input: { query?: string }): Prisma.WatchAccountWhereInput {
  const query = normalizeWatchAccountQuery(input.query);

  if (query === undefined) {
    return {};
  }

  return {
    OR: [
      {
        xUsername: {
          contains: query,
        },
      },
      {
        displayName: {
          contains: query,
        },
      },
    ],
  };
}

function normalizeWatchAccountQuery(query: string | undefined): string | undefined {
  if (query === undefined) {
    return undefined;
  }

  const normalizedQuery = query.trim().replace(/^@+/, '').toLowerCase();
  return normalizedQuery.length === 0 ? undefined : normalizedQuery;
}

function toWatchAccountUpdateData(input: UpdateWatchAccountInput | CreateWatchAccountInput): Prisma.WatchAccountUpdateInput {
  const data: Prisma.WatchAccountUpdateInput = {};

  if (input.displayName !== undefined) {
    data.displayName = input.displayName;
  }
  if (input.enabled !== undefined) {
    data.enabled = input.enabled;
  }
  if (input.xUserId !== undefined) {
    data.xUserId = input.xUserId;
  }
  if (input.baselinePostId !== undefined) {
    data.baselinePostId = input.baselinePostId;
  }
  if (input.lastSeenPostId !== undefined) {
    data.lastSeenPostId = input.lastSeenPostId;
  }
  if (input.lastPolledAt !== undefined) {
    data.lastPolledAt = input.lastPolledAt;
  }
  if (input.lastPollStatus !== undefined) {
    data.lastPollStatus = input.lastPollStatus;
  }
  if (input.lastPollError !== undefined) {
    data.lastPollError = input.lastPollError;
  }

  return data;
}
