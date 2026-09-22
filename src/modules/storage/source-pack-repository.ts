import { Prisma, type PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type {
  CreateSourcePackInput,
  SourcePack,
  SourcePackWithMembers,
  UpdateSourcePackInput,
} from './types';

export class SourcePackRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: CreateSourcePackInput): Promise<SourcePackWithMembers> {
    const now = createTimestamp();

    return this.prisma.$transaction(async (tx) => {
      const sourcePack = await tx.sourcePack.create({
        data: {
          createdAt: now,
          description: input.description ?? null,
          enabled: input.enabled ?? true,
          id: createDatabaseId(),
          name: normalizePackName(input.name),
          sortOrder: input.sortOrder ?? 0,
          updatedAt: now,
        },
      });

      await this.createMembers(tx, sourcePack.id, input.sourceIds ?? []);

      return this.findPackWithMembers(tx, sourcePack.id);
    });
  }

  public async update(id: string, input: UpdateSourcePackInput): Promise<SourcePackWithMembers | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.sourcePack.findUnique({ where: { id } });

      if (existing === null) {
        return null;
      }

      const data: Prisma.SourcePackUpdateInput = { updatedAt: createTimestamp() };

      if (input.name !== undefined) {
        data.name = normalizePackName(input.name);
      }
      if (input.description !== undefined) {
        data.description = input.description;
      }
      if (input.enabled !== undefined) {
        data.enabled = input.enabled;
      }
      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder;
      }

      await tx.sourcePack.update({ data, where: { id } });

      if (input.sourceIds !== undefined) {
        const currentItems = await tx.sourcePackItem.findMany({
          select: { watchAccountId: true },
          where: { packId: id },
        });
        const nextSourceIds = [...new Set(input.sourceIds)];
        const nextSet = new Set(nextSourceIds);
        const toRemove = currentItems
          .map((item) => item.watchAccountId)
          .filter((watchAccountId) => !nextSet.has(watchAccountId));
        const currentSet = new Set(currentItems.map((item) => item.watchAccountId));
        const toCreate = nextSourceIds.filter((watchAccountId) => !currentSet.has(watchAccountId));

        if (toRemove.length > 0) {
          await tx.sourcePackItem.deleteMany({
            where: { packId: id, watchAccountId: { in: toRemove } },
          });
        }

        await this.createMembers(tx, id, toCreate);
      }

      return this.findPackWithMembers(tx, id);
    });
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.prisma.sourcePack.deleteMany({
      where: { id },
    });

    return result.count > 0;
  }

  public async findById(id: string): Promise<SourcePackWithMembers | null> {
    const sourcePack = await this.prisma.sourcePack.findUnique({
      where: { id },
    });

    if (sourcePack === null) {
      return null;
    }

    return {
      ...mapSourcePack(sourcePack),
      memberSourceIds: await this.listMemberSourceIds(this.prisma, id),
    };
  }

  public async findByName(name: string): Promise<SourcePackWithMembers | null> {
    const sourcePack = await this.prisma.sourcePack.findUnique({
      where: { name: normalizePackName(name) },
    });

    if (sourcePack === null) {
      return null;
    }

    return {
      ...mapSourcePack(sourcePack),
      memberSourceIds: await this.listMemberSourceIds(this.prisma, sourcePack.id),
    };
  }

  public async listAll(): Promise<SourcePackWithMembers[]> {
    const sourcePacks = await this.prisma.sourcePack.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const items = await this.prisma.sourcePackItem.findMany({
      orderBy: { id: 'asc' },
    });
    const membersByPackId = new Map<string, string[]>();

    for (const item of items) {
      const list = membersByPackId.get(item.packId) ?? [];
      list.push(item.watchAccountId);
      membersByPackId.set(item.packId, list);
    }

    return sourcePacks.map((sourcePack) => ({
      ...mapSourcePack(sourcePack),
      memberSourceIds: membersByPackId.get(sourcePack.id) ?? [],
    }));
  }

  /** 一次性取回一批包的启用/全部成员（watch_account_id），供投递过滤解析使用。 */
  public async listMemberSourceIdsByPackIds(
    packIds: string[],
    options: { enabledOnly?: boolean } = {},
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();

    if (packIds.length === 0) {
      return result;
    }

    const items = await this.prisma.sourcePackItem.findMany({
      orderBy: { id: 'asc' },
      where: {
        packId: { in: packIds },
        ...(options.enabledOnly === true
          ? { pack: { enabled: true } }
          : {}),
      },
      select: { packId: true, watchAccountId: true },
    });

    for (const item of items) {
      const list = result.get(item.packId) ?? [];
      list.push(item.watchAccountId);
      result.set(item.packId, list);
    }

    return result;
  }

  private async createMembers(
    tx: Prisma.TransactionClient,
    packId: string,
    sourceIds: string[],
  ): Promise<void> {
    const dedupedSourceIds = [...new Set(sourceIds)];

    if (dedupedSourceIds.length === 0) {
      return;
    }

    const knownAccounts = await tx.watchAccount.findMany({
      select: { id: true },
      where: { id: { in: dedupedSourceIds } },
    });
    const knownIds = new Set(knownAccounts.map((account) => account.id));

    await tx.sourcePackItem.createMany({
      data: dedupedSourceIds
        .filter((watchAccountId) => knownIds.has(watchAccountId))
        .map((watchAccountId) => ({
          id: createDatabaseId(),
          packId,
          watchAccountId,
        })),
    });
  }

  private async listMemberSourceIds(
    client: PrismaClient | Prisma.TransactionClient,
    packId: string,
  ): Promise<string[]> {
    const items = await client.sourcePackItem.findMany({
      orderBy: { id: 'asc' },
      select: { watchAccountId: true },
      where: { packId },
    });

    return items.map((item) => item.watchAccountId);
  }

  private async findPackWithMembers(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<SourcePackWithMembers> {
    const sourcePack = await tx.sourcePack.findUniqueOrThrow({ where: { id } });

    return {
      ...mapSourcePack(sourcePack),
      memberSourceIds: await this.listMemberSourceIds(tx, id),
    };
  }
}

function mapSourcePack(sourcePack: Prisma.SourcePackGetPayload<Record<string, never>>): SourcePack {
  return {
    createdAt: sourcePack.createdAt,
    description: sourcePack.description,
    enabled: sourcePack.enabled,
    id: sourcePack.id,
    name: sourcePack.name,
    sortOrder: sourcePack.sortOrder,
    updatedAt: sourcePack.updatedAt,
  };
}

function normalizePackName(name: string): string {
  return name.trim();
}
