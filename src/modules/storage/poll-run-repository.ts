import type { Prisma, PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type { CreatePollRunInput, PollRun, UpdatePollRunInput } from './types';

export class PollRunRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: CreatePollRunInput = {}): Promise<PollRun> {
    const createdAt = createTimestamp();
    const pollRun = await this.prisma.pollRun.create({
      data: {
        accountsFailed: input.accountsFailed ?? 0,
        accountsSucceeded: input.accountsSucceeded ?? 0,
        accountsTotal: input.accountsTotal ?? 0,
        createdAt,
        errorSummary: input.errorSummary ?? null,
        eventsCreated: input.eventsCreated ?? 0,
        finishedAt: input.finishedAt ?? null,
        id: input.id ?? createDatabaseId(),
        newPostsDetected: input.newPostsDetected ?? 0,
        startedAt: input.startedAt ?? createdAt,
        status: input.status ?? 'running',
      },
    });

    return mapPollRun(pollRun);
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.prisma.pollRun.deleteMany({
      where: { id },
    });

    return result.count > 0;
  }

  public async findById(id: string): Promise<PollRun | null> {
    const pollRun = await this.prisma.pollRun.findUnique({
      where: { id },
    });

    return pollRun === null ? null : mapPollRun(pollRun);
  }

  public async listRecent(limit = 20): Promise<PollRun[]> {
    const pollRuns = await this.prisma.pollRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return pollRuns.map(mapPollRun);
  }

  public async listPage(input: { page: number; pageSize: number }): Promise<PollRun[]> {
    const pollRuns = await this.prisma.pollRun.findMany({
      orderBy: { startedAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    });

    return pollRuns.map(mapPollRun);
  }

  public async countAll(): Promise<number> {
    return this.prisma.pollRun.count();
  }

  public async update(id: string, input: UpdatePollRunInput): Promise<PollRun | null> {
    const data = toPollRunUpdateData(input);

    if (Object.keys(data).length === 0) {
      return this.findById(id);
    }

    const result = await this.prisma.pollRun.updateMany({
      data,
      where: { id },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(id);
  }
}

function mapPollRun(pollRun: Prisma.PollRunGetPayload<Record<string, never>>): PollRun {
  return {
    accountsFailed: pollRun.accountsFailed,
    accountsSucceeded: pollRun.accountsSucceeded,
    accountsTotal: pollRun.accountsTotal,
    createdAt: pollRun.createdAt,
    errorSummary: pollRun.errorSummary,
    eventsCreated: pollRun.eventsCreated,
    finishedAt: pollRun.finishedAt,
    id: pollRun.id,
    newPostsDetected: pollRun.newPostsDetected,
    startedAt: pollRun.startedAt,
    status: pollRun.status as PollRun['status'],
  };
}

function toPollRunUpdateData(input: UpdatePollRunInput): Prisma.PollRunUpdateInput {
  const data: Prisma.PollRunUpdateInput = {};

  if (input.finishedAt !== undefined) {
    data.finishedAt = input.finishedAt;
  }
  if (input.status !== undefined) {
    data.status = input.status;
  }
  if (input.accountsTotal !== undefined) {
    data.accountsTotal = input.accountsTotal;
  }
  if (input.accountsSucceeded !== undefined) {
    data.accountsSucceeded = input.accountsSucceeded;
  }
  if (input.accountsFailed !== undefined) {
    data.accountsFailed = input.accountsFailed;
  }
  if (input.newPostsDetected !== undefined) {
    data.newPostsDetected = input.newPostsDetected;
  }
  if (input.eventsCreated !== undefined) {
    data.eventsCreated = input.eventsCreated;
  }
  if (input.errorSummary !== undefined) {
    data.errorSummary = input.errorSummary;
  }

  return data;
}
