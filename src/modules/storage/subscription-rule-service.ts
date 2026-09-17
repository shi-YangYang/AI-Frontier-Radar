import type { AppSettingRepository } from './app-setting-repository';

export type SubscriptionRuleMode = 'all' | 'any';

export interface SubscriptionRule {
  enabled: boolean;
  exclude: string[];
  id: string;
  include: string[];
  mode: SubscriptionRuleMode;
  name: string;
  targetKeys: string[];
}

const SUBSCRIPTION_RULES_KEY = 'subscription.rules';
const MAX_RULES = 50;
const MAX_TERMS_PER_RULE = 50;
const MAX_TERM_LENGTH = 100;
const MAX_TARGET_KEYS_PER_RULE = 50;
const MAX_TARGET_KEY_LENGTH = 100;
const MAX_RULE_NAME_LENGTH = 100;

export class SubscriptionRuleValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SubscriptionRuleValidationError';
  }
}

export class SubscriptionRuleService {
  public constructor(
    private readonly options: { appSettings: Pick<AppSettingRepository, 'getJson' | 'setJson'> },
  ) {}

  public async getRules(): Promise<SubscriptionRule[]> {
    const stored = await this.options.appSettings.getJson<unknown>(SUBSCRIPTION_RULES_KEY);

    if (!Array.isArray(stored)) {
      return [];
    }

    const rules: SubscriptionRule[] = [];

    for (const entry of stored) {
      try {
        rules.push(parseRule(entry));
      } catch {
        // Skip settings entries that cannot be normalized.
      }
    }

    return rules;
  }

  public async saveRules(input: unknown): Promise<SubscriptionRule[]> {
    if (!Array.isArray(input)) {
      throw new SubscriptionRuleValidationError('rules 必须是数组。');
    }

    if (input.length > MAX_RULES) {
      throw new SubscriptionRuleValidationError(`规则数量不能超过 ${MAX_RULES} 条。`);
    }

    const rules = input.map((entry, index) => parseRule(entry, index));
    await this.options.appSettings.setJson(SUBSCRIPTION_RULES_KEY, rules);

    return rules;
  }
}

export function createSubscriptionRuleService(options: {
  appSettings: Pick<AppSettingRepository, 'getJson' | 'setJson'>;
}): SubscriptionRuleService {
  return new SubscriptionRuleService(options);
}

export function parseRule(value: unknown, index = 0): SubscriptionRule {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SubscriptionRuleValidationError(`rules[${index}] 必须是对象。`);
  }

  const record = value as Record<string, unknown>;
  const name = readRuleName(record.name, index);
  const mode = readMode(record.mode, index);
  const include = readTermList(record.include, `rules[${index}].include`);
  const exclude = readTermList(record.exclude, `rules[${index}].exclude`);
  const enabled = record.enabled === undefined ? true : record.enabled;

  if (typeof enabled !== 'boolean') {
    throw new SubscriptionRuleValidationError(`rules[${index}].enabled 必须是布尔值。`);
  }

  if (include.length === 0 && exclude.length === 0) {
    throw new SubscriptionRuleValidationError(`rules[${index}] 至少需要一个包含词或排除词。`);
  }

  const id =
    typeof record.id === 'string' && record.id.trim().length > 0
      ? record.id.trim()
      : `rule-${index + 1}`;

  return {
    enabled,
    exclude,
    id,
    include,
    mode,
    name,
    targetKeys: readTargetKeys(record.targetKeys, index),
  };
}

function readTargetKeys(value: unknown, index: number): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new SubscriptionRuleValidationError(`rules[${index}].targetKeys 必须是字符串数组。`);
  }

  if (value.length > MAX_TARGET_KEYS_PER_RULE) {
    throw new SubscriptionRuleValidationError(
      `rules[${index}].targetKeys 不能超过 ${MAX_TARGET_KEYS_PER_RULE} 个。`,
    );
  }

  const targetKeys: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new SubscriptionRuleValidationError(`rules[${index}].targetKeys 只能包含字符串。`);
    }

    const targetKey = entry.trim();

    if (targetKey.length === 0 || targetKey.length > MAX_TARGET_KEY_LENGTH) {
      continue;
    }

    if (!targetKeys.includes(targetKey)) {
      targetKeys.push(targetKey);
    }
  }

  return targetKeys;
}

function readRuleName(value: unknown, index: number): string {
  if (value === undefined || value === null) {
    return `规则 ${index + 1}`;
  }

  if (typeof value !== 'string') {
    throw new SubscriptionRuleValidationError(`rules[${index}].name 必须是字符串。`);
  }

  const name = value.trim();

  if (name.length === 0) {
    return `规则 ${index + 1}`;
  }

  if (name.length > MAX_RULE_NAME_LENGTH) {
    throw new SubscriptionRuleValidationError(
      `rules[${index}].name 不能超过 ${MAX_RULE_NAME_LENGTH} 个字符。`,
    );
  }

  return name;
}

function readMode(value: unknown, index: number): SubscriptionRuleMode {
  if (value === undefined || value === 'any') {
    return 'any';
  }

  if (value === 'all') {
    return 'all';
  }

  throw new SubscriptionRuleValidationError(`rules[${index}].mode 必须是 any 或 all。`);
}

function readTermList(value: unknown, fieldName: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new SubscriptionRuleValidationError(`${fieldName} 必须是字符串数组。`);
  }

  if (value.length > MAX_TERMS_PER_RULE) {
    throw new SubscriptionRuleValidationError(
      `${fieldName} 不能超过 ${MAX_TERMS_PER_RULE} 个词。`,
    );
  }

  const terms: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new SubscriptionRuleValidationError(`${fieldName} 只能包含字符串。`);
    }

    const term = entry.trim();

    if (term.length === 0) {
      continue;
    }

    if (term.length > MAX_TERM_LENGTH) {
      throw new SubscriptionRuleValidationError(
        `${fieldName} 中的词不能超过 ${MAX_TERM_LENGTH} 个字符。`,
      );
    }

    if (!terms.includes(term)) {
      terms.push(term);
    }
  }

  return terms;
}
