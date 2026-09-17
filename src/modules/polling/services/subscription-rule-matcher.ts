import type { SubscriptionRule } from '../../storage/subscription-rule-service';

export interface SubscriptionRuleMatcher {
  hasEnabledRules: boolean;
  matches(text: string): boolean;
  resolveTargetKeys(text: string, allTargetKeys: string[]): Set<string>;
}

export function createSubscriptionRuleMatcher(rules: SubscriptionRule[]): SubscriptionRuleMatcher {
  const activeRules = rules.filter(
    (rule) => rule.enabled && (rule.include.length > 0 || rule.exclude.length > 0),
  );

  return {
    hasEnabledRules: activeRules.length > 0,
    matches(text: string): boolean {
      const haystack = text.toLowerCase();

      return activeRules.some((rule) => matchesRule(rule, haystack));
    },
    resolveTargetKeys(text: string, allTargetKeys: string[]): Set<string> {
      if (activeRules.length === 0) {
        return new Set(allTargetKeys);
      }

      const haystack = text.toLowerCase();
      const resolved = new Set<string>();

      for (const rule of activeRules) {
        if (!matchesRule(rule, haystack)) {
          continue;
        }

        if (rule.targetKeys.length === 0) {
          return new Set(allTargetKeys);
        }

        for (const targetKey of rule.targetKeys) {
          resolved.add(targetKey);
        }
      }

      return resolved;
    },
  };
}

function matchesRule(rule: SubscriptionRule, haystack: string): boolean {
  if (rule.exclude.some((term) => haystack.includes(term.toLowerCase()))) {
    return false;
  }

  if (rule.include.length === 0) {
    return true;
  }

  const hitCount = rule.include.filter((term) => haystack.includes(term.toLowerCase())).length;

  return rule.mode === 'all' ? hitCount === rule.include.length : hitCount > 0;
}
