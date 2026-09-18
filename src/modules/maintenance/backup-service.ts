import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import { createPrismaClient } from '../storage/prisma-client';

export interface BackupEntry {
  createdAt: string;
  name: string;
  sizeBytes: number;
}

export interface BackupLogger {
  info?: (payload: Record<string, unknown>, message: string) => void;
}

export interface BackupServiceOptions {
  backupsDir: string;
  databaseUrl: string;
  logger?: BackupLogger;
}

const MAX_BACKUPS = 10;
const BACKUP_NAME_PATTERN = /^backup-\d{8}-\d{6}(?:-\d+)?\.sqlite$/;

export class BackupService {
  public constructor(private readonly options: BackupServiceOptions) {}

  public async create(): Promise<BackupEntry> {
    await mkdir(this.options.backupsDir, { recursive: true });
    const targetPath = await this.resolveAvailablePath();
    const prisma = createPrismaClient(this.options.databaseUrl);

    try {
      await prisma.$executeRawUnsafe(`VACUUM INTO '${targetPath.replace(/'/gu, "''")}'`);
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }

    await this.prune();

    const entry = await this.describeEntry(path.basename(targetPath));
    this.options.logger?.info?.(
      { name: entry.name, sizeBytes: entry.sizeBytes },
      '数据库备份已创建',
    );

    return entry;
  }

  public async list(): Promise<BackupEntry[]> {
    const names = await this.listNames();
    const entries = await Promise.all(names.map((name) => this.describeEntry(name)));

    return entries.sort((left, right) => right.name.localeCompare(left.name));
  }

  public async delete(name: string): Promise<boolean> {
    const targetPath = this.resolvePath(name);

    try {
      await unlink(targetPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }

      throw error;
    }
  }

  public resolvePath(name: string): string {
    if (!BACKUP_NAME_PATTERN.test(name)) {
      throw new Error('备份文件名无效。');
    }

    return path.join(this.options.backupsDir, name);
  }

  private async resolveAvailablePath(): Promise<string> {
    const baseName = `backup-${formatTimestamp(new Date())}`;
    let candidate = path.join(this.options.backupsDir, `${baseName}.sqlite`);
    let suffix = 2;

    for (;;) {
      try {
        await stat(candidate);
        candidate = path.join(this.options.backupsDir, `${baseName}-${suffix}.sqlite`);
        suffix += 1;
      } catch {
        return candidate;
      }
    }
  }

  private async listNames(): Promise<string[]> {
    try {
      const names = await readdir(this.options.backupsDir);

      return names.filter((name) => BACKUP_NAME_PATTERN.test(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  private async describeEntry(name: string): Promise<BackupEntry> {
    const fileStat = await stat(this.resolvePath(name));

    return {
      createdAt: fileStat.mtime.toISOString(),
      name,
      sizeBytes: fileStat.size,
    };
  }

  private async prune(): Promise<void> {
    const names = (await this.listNames()).sort((left, right) => right.localeCompare(left));

    for (const name of names.slice(MAX_BACKUPS)) {
      await unlink(this.resolvePath(name)).catch(() => undefined);
    }
  }
}

export function createBackupService(options: BackupServiceOptions): BackupService {
  return new BackupService(options);
}

function formatTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');

  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}
