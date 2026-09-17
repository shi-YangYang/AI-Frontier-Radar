import { Prisma, type PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type {
  CreateWatchAccountInput,
  UpdateWatchAccountInput,
  WatchAccount,
  WatchAccountSourceType,
} from './types';
import { escapeLikePattern } from './sqlite-like';

interface WatchAccountSourceKey {
  sourceType: WatchAccountSourceType;
  sourceUrl: string;
}

export class WatchAccountRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createIfAbsentByUsername(
    input: CreateWatchAccountInput & { xUsername: string },
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

  public async createIfAbsentBySource(
    input: CreateWatchAccountInput & WatchAccountSourceKey,
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
        const existingWatchAccount = await this.findBySource(input);

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
        sourceType: input.sourceType ?? 'x',
        sourceUrl: input.sourceUrl ?? null,
        updatedAt: now,
        xUserId: input.xUserId ?? null,
        xUsername: normalizeOptionalXUsername(input.xUsername),
      },
    });

    return mapWatchAccount(watchAccount);
  }

  public async resetBoardSourceCursors(): Promise<number> {
    const result = await this.prisma.watchAccount.updateMany({
      data: {
        baselinePostId: null,
        lastSeenPostId: null,
      },
      where: {
        sourceType: {
          in: [
            'ai2_blog',
            'anthropic_news',
            'github',
            'hf_papers',
            'meta_ai_blog',
            'moonshot_blog',
            'xai_news',
          ],
        },
      },
    });

    return result.count;
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

  public async findBySource(input: WatchAccountSourceKey): Promise<WatchAccount | null> {
    const watchAccount = await this.prisma.watchAccount.findUnique({
      where: {
        sourceType_sourceUrl: {
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl,
        },
      },
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
      where: await this.buildWhereInput(input),
    });

    return watchAccounts.map(mapWatchAccount);
  }

  public async countAll(input: { query?: string } = {}): Promise<number> {
    return this.prisma.watchAccount.count({
      where: await this.buildWhereInput(input),
    });
  }

  private async buildWhereInput(input: { query?: string }): Promise<Prisma.WatchAccountWhereInput> {
    const query = normalizeWatchAccountQuery(input.query);

    if (query === undefined) {
      return {};
    }

    const matches = await findMatchingQueryValues(this.prisma, query);

    return {
      OR: [
        { xUsername: { in: matches.usernames } },
        { displayName: { in: matches.displayNames } },
        { sourceUrl: { in: matches.sourceUrls } },
      ],
    };
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
        sourceType: 'x',
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

  public async upsertByUsername(
    input: CreateWatchAccountInput & { xUsername: string },
  ): Promise<WatchAccount> {
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
        sourceType: 'x',
        sourceUrl: null,
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
    input: { enabled?: boolean; xUsername: string },
  ): Promise<WatchAccount> {
    const now = createTimestamp();
    const xUsername = normalizeXUsername(input.xUsername);
    const watchAccount = await this.prisma.watchAccount.upsert({
      create: {
        createdAt: now,
        enabled: input.enabled ?? true,
        id: createDatabaseId(),
        sourceType: 'x',
        sourceUrl: null,
        updatedAt: now,
        xUsername,
      },
      update: {
        enabled: input.enabled ?? true,
        updatedAt: createTimestamp(),
      },
      where: {
        xUsername,
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
    sourceType: watchAccount.sourceType as WatchAccount['sourceType'],
    sourceUrl: watchAccount.sourceUrl,
    updatedAt: watchAccount.updatedAt,
    xUserId: watchAccount.xUserId,
    xUsername: watchAccount.xUsername,
  };
}

export function normalizeXUsername(xUsername: string): string {
  return xUsername.trim().replace(/^@+/, '').toLowerCase();
}

function normalizeOptionalXUsername(xUsername: string | null | undefined): string | null {
  if (xUsername === undefined || xUsername === null || xUsername.trim().length === 0) {
    return null;
  }

  return normalizeXUsername(xUsername);
}

async function findMatchingQueryValues(
  prisma: PrismaClient,
  query: string,
): Promise<{ displayNames: string[]; sourceUrls: string[]; usernames: string[] }> {
  const pattern = `%${escapeLikePattern(query)}%`;
  const [usernameRows, displayNameRows, sourceUrlRows] = await Promise.all([
    prisma.$queryRaw<Array<{ x_username: string }>>`
      SELECT DISTINCT x_username FROM watch_accounts
      WHERE x_username LIKE ${pattern} ESCAPE '\\'
    `,
    prisma.$queryRaw<Array<{ display_name: string }>>`
      SELECT DISTINCT display_name FROM watch_accounts
      WHERE display_name LIKE ${pattern} ESCAPE '\\'
    `,
    prisma.$queryRaw<Array<{ source_url: string }>>`
      SELECT DISTINCT source_url FROM watch_accounts
      WHERE source_url LIKE ${pattern} ESCAPE '\\'
    `,
  ]);

  return {
    displayNames: displayNameRows.map((row) => row.display_name),
    sourceUrls: sourceUrlRows.map((row) => row.source_url),
    usernames: usernameRows.map((row) => row.x_username),
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
