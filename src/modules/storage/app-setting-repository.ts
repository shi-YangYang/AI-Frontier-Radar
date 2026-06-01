import type { Prisma, PrismaClient } from '@prisma/client';

import { createDatabaseId, createTimestamp } from './database';
import type { AppSetting, CreateAppSettingInput, UpdateAppSettingInput } from './types';

export class AppSettingRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: CreateAppSettingInput): Promise<AppSetting> {
    const now = createTimestamp();
    const appSetting = await this.prisma.appSetting.create({
      data: {
        createdAt: now,
        id: input.id ?? createDatabaseId(),
        settingKey: input.settingKey,
        updatedAt: now,
        valueJson: input.valueJson,
      },
    });

    return mapAppSetting(appSetting);
  }

  public async findByKey(settingKey: string): Promise<AppSetting | null> {
    const appSetting = await this.prisma.appSetting.findUnique({
      where: { settingKey },
    });

    return appSetting === null ? null : mapAppSetting(appSetting);
  }

  public async deleteByKey(settingKey: string): Promise<boolean> {
    const result = await this.prisma.appSetting.deleteMany({
      where: { settingKey },
    });

    return result.count > 0;
  }

  public async getJson<T>(settingKey: string): Promise<T | null> {
    const appSetting = await this.findByKey(settingKey);

    if (appSetting === null) {
      return null;
    }

    return parseValueJson<T>(settingKey, appSetting.valueJson);
  }

  public async getManyJson(settingKeys: string[]): Promise<Record<string, unknown>> {
    if (settingKeys.length === 0) {
      return {};
    }

    const appSettings = await this.prisma.appSetting.findMany({
      where: {
        settingKey: {
          in: settingKeys,
        },
      },
    });
    const values: Record<string, unknown> = {};

    for (const appSetting of appSettings) {
      values[appSetting.settingKey] = parseValueJson(appSetting.settingKey, appSetting.valueJson);
    }

    return values;
  }

  public async setJson(settingKey: string, value: unknown): Promise<AppSetting> {
    const now = createTimestamp();
    const valueJson = stringifyValueJson(settingKey, value);
    const appSetting = await this.prisma.appSetting.upsert({
      create: {
        createdAt: now,
        id: createDatabaseId(),
        settingKey,
        updatedAt: now,
        valueJson,
      },
      update: {
        updatedAt: createTimestamp(),
        valueJson,
      },
      where: {
        settingKey,
      },
    });

    return mapAppSetting(appSetting);
  }

  public async update(settingKey: string, input: UpdateAppSettingInput): Promise<AppSetting | null> {
    if (input.valueJson === undefined) {
      return this.findByKey(settingKey);
    }

    const result = await this.prisma.appSetting.updateMany({
      data: {
        updatedAt: createTimestamp(),
        valueJson: input.valueJson,
      },
      where: { settingKey },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findByKey(settingKey);
  }
}

function mapAppSetting(appSetting: Prisma.AppSettingGetPayload<Record<string, never>>): AppSetting {
  return {
    createdAt: appSetting.createdAt,
    id: appSetting.id,
    settingKey: appSetting.settingKey,
    updatedAt: appSetting.updatedAt,
    valueJson: appSetting.valueJson,
  };
}

function parseValueJson<T>(settingKey: string, valueJson: string): T {
  try {
    return JSON.parse(valueJson) as T;
  } catch {
    throw new Error(`App setting "${settingKey}" contains invalid JSON in value_json.`);
  }
}

function stringifyValueJson(settingKey: string, value: unknown): string {
  try {
    const valueJson = JSON.stringify(value);

    if (valueJson === undefined) {
      throw new Error('JSON.stringify returned undefined.');
    }

    return valueJson;
  } catch {
    throw new Error(`App setting "${settingKey}" could not be serialized to JSON.`);
  }
}
