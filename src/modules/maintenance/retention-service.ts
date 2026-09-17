import type { StorageContext } from '../storage';

export interface RetentionSettings {
  expiredEvents: number;
  expiredPosts: number;
  lastCleanupAt: string | null;
  retentionDays: number;
}

export interface RetentionCleanupResult {
  deletedEvents: number;
  deletedPosts: number;
}

export interface RetentionLogger {
  info?: (payload: Record<string, unknown>, message: string) => void;
  warn?: (payload: Record<string, unknown>, message: string) => void;
}

export interface RetentionServiceOptions {
  logger?: RetentionLogger;
  storage: StorageContext;
}

const RETENTION_DAYS_KEY = 'data.retentionDays';
const LAST_CLEANUP_AT_KEY = 'data.lastCleanupAt';
const AUTO_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const CLEANUP_BATCH_SIZE = 500;
const MAX_RETENTION_DAYS = 3_650;

export class RetentionService {
  private cleanupInFlight: Promise<RetentionCleanupResult> | null = null;

  public constructor(private readonly options: RetentionServiceOptions) {}

  public async getSettings(): Promise<RetentionSettings> {
    const [retentionDays, lastCleanupAt, expired] = await Promise.all([
      this.readRetentionDays(),
      this.readLastCleanupAt(),
      this.countExpired(),
    ]);

    return {
      expiredEvents: expired.expiredEvents,
      expiredPosts: expired.expiredPosts,
      lastCleanupAt,
      retentionDays,
    };
  }

  public async saveSettings(input: { retentionDays: number }): Promise<RetentionSettings> {
    const retentionDays = input.retentionDays;

    if (!Number.isSafeInteger(retentionDays) || retentionDays < 0 || retentionDays > MAX_RETENTION_DAYS) {
      throw new Error(`retentionDays must be an integer from 0 to ${MAX_RETENTION_DAYS}.`);
    }

    await this.options.storage.appSettings.setJson(RETENTION_DAYS_KEY, retentionDays);

    return this.getSettings();
  }

  public cleanupNow(): Promise<RetentionCleanupResult> {
    if (this.cleanupInFlight !== null) {
      return this.cleanupInFlight;
    }

    const operation = this.runCleanup().finally(() => {
      this.cleanupInFlight = null;
    });
    this.cleanupInFlight = operation;

    return operation;
  }

  public async runIfDue(): Promise<RetentionCleanupResult | null> {
    const [retentionDays, lastCleanupAt] = await Promise.all([
      this.readRetentionDays(),
      this.readLastCleanupAt(),
    ]);

    if (retentionDays <= 0) {
      return null;
    }

    if (
      lastCleanupAt !== null &&
      Date.now() - Date.parse(lastCleanupAt) < AUTO_CLEANUP_INTERVAL_MS
    ) {
      return null;
    }

    return this.cleanupNow();
  }

  private async runCleanup(): Promise<RetentionCleanupResult> {
    const retentionDays = await this.readRetentionDays();

    if (retentionDays <= 0) {
      return { deletedEvents: 0, deletedPosts: 0 };
    }

    const cutoffIso = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    let deletedEvents = 0;
    let deletedPosts = 0;

    for (;;) {
      const expiredIds = await this.options.storage.xPosts.listExpiredIds(
        cutoffIso,
        CLEANUP_BATCH_SIZE,
      );

      if (expiredIds.length === 0) {
        break;
      }

      deletedEvents += await this.options.storage.deliveryEvents.deleteByXPostIds(expiredIds);
      deletedPosts += await this.options.storage.xPosts.deleteByXPostIds(expiredIds);
    }

    await this.options.storage.appSettings.setJson(LAST_CLEANUP_AT_KEY, new Date().toISOString());
    this.options.logger?.info?.(
      { deletedEvents, deletedPosts, retentionDays },
      'retention cleanup completed',
    );

    return { deletedEvents, deletedPosts };
  }

  private async countExpired(): Promise<{ expiredEvents: number; expiredPosts: number }> {
    const retentionDays = await this.readRetentionDays();

    if (retentionDays <= 0) {
      return { expiredEvents: 0, expiredPosts: 0 };
    }

    const cutoffIso = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const [expiredPosts, expiredEvents] = await Promise.all([
      this.options.storage.xPosts.countExpired(cutoffIso),
      this.options.storage.deliveryEvents.countExpiredByPostCutoff(cutoffIso),
    ]);

    return { expiredEvents, expiredPosts };
  }

  private async readRetentionDays(): Promise<number> {
    const value = await this.options.storage.appSettings.getJson<unknown>(RETENTION_DAYS_KEY);

    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > MAX_RETENTION_DAYS
    ) {
      return 0;
    }

    return value;
  }

  private async readLastCleanupAt(): Promise<string | null> {
    const value = await this.options.storage.appSettings.getJson<unknown>(LAST_CLEANUP_AT_KEY);

    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}

export function createRetentionService(options: RetentionServiceOptions): RetentionService {
  return new RetentionService(options);
}
