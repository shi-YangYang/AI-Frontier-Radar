export interface LogBufferEntry {
  [key: string]: unknown;
  level: string;
  time: string;
}

export interface LogBufferQuery {
  level?: string;
  limit: number;
}

const LEVEL_PRIORITY: Record<string, number> = {
  debug: 20,
  error: 50,
  fatal: 60,
  info: 30,
  trace: 10,
  warn: 40,
};

export class LogRingBuffer {
  private readonly entries: LogBufferEntry[] = [];

  public constructor(private readonly capacity: number) {}

  public get size(): number {
    return this.entries.length;
  }

  public get maxSize(): number {
    return this.capacity;
  }

  public push(entry: LogBufferEntry): void {
    this.entries.push(entry);

    while (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  public list(query: LogBufferQuery): LogBufferEntry[] {
    const minimumPriority = query.level === undefined ? undefined : LEVEL_PRIORITY[query.level];
    const filtered =
      minimumPriority === undefined
        ? this.entries
        : this.entries.filter(
            (entry) => (LEVEL_PRIORITY[entry.level] ?? 0) >= minimumPriority,
          );

    return [...filtered].reverse().slice(0, query.limit);
  }

  public clear(): void {
    this.entries.length = 0;
  }
}

export const sharedLogBuffer = new LogRingBuffer(500);
