import { ConfigValidationError } from './config-validation-error';

export type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

interface StringOption {
  allowEmpty?: boolean;
  defaultValue?: string;
  required?: boolean;
}

interface IntegerOption {
  defaultValue?: number;
  max?: number;
  min?: number;
  required?: boolean;
}

interface BooleanOption {
  defaultValue?: boolean;
  required?: boolean;
}

interface UrlOption {
  defaultValue?: string;
  protocols?: readonly string[];
  required?: boolean;
}

interface EnumOption<T extends string> {
  defaultValue?: T;
  required?: boolean;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export class EnvReader {
  private readonly issues: string[] = [];

  public constructor(private readonly env: EnvSource) {}

  public addIssue(issue: string): void {
    this.issues.push(issue);
  }

  public addIssues(issues: string[]): void {
    this.issues.push(...issues);
  }

  public hasIssues(): boolean {
    return this.issues.length > 0;
  }

  public readString(name: string, options: StringOption = {}): string {
    const rawValue = this.readRaw(name);

    if (rawValue === undefined) {
      if (options.defaultValue !== undefined) {
        return options.defaultValue;
      }

      if (options.required) {
        this.addIssue(`${name} is required.`);
      }

      return '';
    }

    if (!options.allowEmpty && rawValue.length === 0) {
      this.addIssue(`${name} must not be empty.`);
      return options.defaultValue ?? '';
    }

    return rawValue;
  }

  public readInteger(name: string, options: IntegerOption = {}): number {
    const rawValue = this.readRaw(name);

    if (rawValue === undefined) {
      if (options.defaultValue !== undefined) {
        return options.defaultValue;
      }

      if (options.required) {
        this.addIssue(`${name} is required.`);
      }

      return options.min ?? 0;
    }

    const parsedValue = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(parsedValue)) {
      this.addIssue(`${name} must be an integer.`);
      return options.defaultValue ?? options.min ?? 0;
    }

    if (options.min !== undefined && parsedValue < options.min) {
      this.addIssue(`${name} must be >= ${options.min}.`);
    }

    if (options.max !== undefined && parsedValue > options.max) {
      this.addIssue(`${name} must be <= ${options.max}.`);
    }

    return parsedValue;
  }

  public readBoolean(name: string, options: BooleanOption = {}): boolean {
    const rawValue = this.readRaw(name);

    if (rawValue === undefined) {
      if (options.defaultValue !== undefined) {
        return options.defaultValue;
      }

      if (options.required) {
        this.addIssue(`${name} is required.`);
      }

      return false;
    }

    const normalizedValue = rawValue.toLowerCase();

    if (TRUE_VALUES.has(normalizedValue)) {
      return true;
    }

    if (FALSE_VALUES.has(normalizedValue)) {
      return false;
    }

    this.addIssue(`${name} must be a boolean. Use one of: ${[...TRUE_VALUES, ...FALSE_VALUES].join(', ')}.`);
    return options.defaultValue ?? false;
  }

  public readUrl(name: string, options: UrlOption = {}): string {
    const rawValue = this.readString(name, {
      defaultValue: options.defaultValue,
      required: options.required,
    });

    if (rawValue.length === 0) {
      return rawValue;
    }

    try {
      const parsedUrl = new URL(rawValue);

      if (options.protocols !== undefined && !options.protocols.includes(parsedUrl.protocol)) {
        this.addIssue(`${name} must use one of these protocols: ${options.protocols.join(', ')}.`);
      }

      return parsedUrl.toString();
    } catch {
      this.addIssue(`${name} must be a valid URL.`);
      return options.defaultValue ?? '';
    }
  }

  public readEnum<const T extends string>(
    name: string,
    allowedValues: readonly T[],
    options: EnumOption<T> = {},
  ): T {
    const rawValue = this.readRaw(name);

    if (rawValue === undefined) {
      if (options.defaultValue !== undefined) {
        return options.defaultValue;
      }

      if (options.required) {
        this.addIssue(`${name} is required.`);
      }

      return allowedValues[0];
    }

    if (allowedValues.includes(rawValue as T)) {
      return rawValue as T;
    }

    this.addIssue(`${name} must be one of: ${allowedValues.join(', ')}.`);
    return options.defaultValue ?? allowedValues[0];
  }

  public assertValid(): void {
    if (this.issues.length > 0) {
      throw new ConfigValidationError(this.issues);
    }
  }

  private readRaw(name: string): string | undefined {
    const value = this.env[name];

    if (typeof value !== 'string') {
      return undefined;
    }

    return value.trim();
  }
}
