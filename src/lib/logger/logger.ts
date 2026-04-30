import { format } from 'node:util';

import type { FastifyBaseLogger } from 'fastify';

import type { AppLogLevel } from '../../shared/config/types';

interface CreateLoggerOptions {
  bindings?: Record<string, unknown>;
  level: AppLogLevel;
}

type LogMethod = (...args: unknown[]) => void;

const LOG_LEVEL_PRIORITY: Record<AppLogLevel, number> = {
  debug: 20,
  error: 50,
  fatal: 60,
  info: 30,
  silent: Number.POSITIVE_INFINITY,
  trace: 10,
  warn: 40,
};

const NOOP_LOG_METHOD: LogMethod = () => undefined;
const SENSITIVE_KEY_PATTERN = /authorization|password|secret|token|webhook/i;

export interface AppLogger extends FastifyBaseLogger {
  debug: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
  info: LogMethod;
  trace: LogMethod;
  warn: LogMethod;
}

export function createLogger(options: CreateLoggerOptions): AppLogger {
  return new JsonConsoleLogger(options.level, options.bindings ?? {});
}

class JsonConsoleLogger implements AppLogger {
  public readonly debug: LogMethod;
  public readonly error: LogMethod;
  public readonly fatal: LogMethod;
  public readonly info: LogMethod;
  public level: AppLogLevel;
  public readonly silent: LogMethod = NOOP_LOG_METHOD;
  public readonly trace: LogMethod;
  public readonly warn: LogMethod;

  public constructor(level: AppLogLevel, private readonly bindings: Record<string, unknown>) {
    this.level = level;
    this.trace = this.createLogMethod('trace');
    this.debug = this.createLogMethod('debug');
    this.info = this.createLogMethod('info');
    this.warn = this.createLogMethod('warn');
    this.error = this.createLogMethod('error');
    this.fatal = this.createLogMethod('fatal');
  }

  public child(bindings: Record<string, unknown>): AppLogger {
    const safeBindings = toSerializableRecord(bindings, new WeakSet<object>());

    return new JsonConsoleLogger(this.level, {
      ...this.bindings,
      ...safeBindings,
    });
  }

  private createLogMethod(level: AppLogLevel): LogMethod {
    return (...args: unknown[]) => {
      if (!this.shouldLog(level)) {
        return;
      }

      const entry = buildLogEntry(level, this.bindings, args);
      const output = JSON.stringify(toSerializableLogValue(entry, undefined, new WeakSet<object>()));
      const stream = level === 'warn' || level === 'error' || level === 'fatal' ? process.stderr : process.stdout;

      stream.write(`${output}\n`);
    };
  }

  private shouldLog(level: AppLogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }
}

function buildLogEntry(
  level: AppLogLevel,
  bindings: Record<string, unknown>,
  args: unknown[],
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    ...bindings,
    level,
    time: new Date().toISOString(),
  };

  if (args.length === 0) {
    return entry;
  }

  const [firstArg, ...restArgs] = args;

  if (firstArg instanceof Error) {
    entry.err = serializeError(firstArg);

    if (restArgs.length > 0) {
      entry.msg = format(...(restArgs as []));
    }

    return entry;
  }

  if (isPlainObject(firstArg)) {
    Object.assign(entry, firstArg);

    if (restArgs.length > 0) {
      entry.msg = format(...(restArgs as []));
    }

    return entry;
  }

  entry.msg = format(...(args as []));
  return entry;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function serializeError(error: Error): Record<string, unknown> {
  const serializedError: Record<string, unknown> = {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };

  for (const [key, value] of Object.entries(error)) {
    serializedError[key] = value;
  }

  return serializedError;
}

function toSerializableLogValue(
  value: unknown,
  currentKey: string | undefined,
  seen: WeakSet<object>,
): unknown {
  if (currentKey !== undefined && SENSITIVE_KEY_PATTERN.test(currentKey)) {
    return '[REDACTED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return toSerializableLogValue(serializeError(value), currentKey, seen);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toSerializableLogValue(item, undefined, seen));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, toSerializableLogValue(entryValue, key, seen)]),
    );
  }

  const constructorName = value.constructor?.name ?? 'Object';

  if (typeof (value as { toJSON?: () => unknown }).toJSON === 'function') {
    try {
      return toSerializableLogValue((value as { toJSON: () => unknown }).toJSON(), currentKey, seen);
    } catch {
      return `[${constructorName}]`;
    }
  }

  const enumerableEntries = Object.entries(value as Record<string, unknown>);

  if (enumerableEntries.length === 0) {
    return `[${constructorName}]`;
  }

  return {
    type: constructorName,
    values: Object.fromEntries(
      enumerableEntries.map(([key, entryValue]) => [key, toSerializableLogValue(entryValue, key, seen)]),
    ),
  };
}

function toSerializableRecord(
  value: Record<string, unknown>,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const serializedValue = toSerializableLogValue(value, undefined, seen);

  if (isPlainObject(serializedValue)) {
    return serializedValue;
  }

  return {
    value: serializedValue,
  };
}
