export class ConfigValidationError extends Error {
  public readonly issues: string[];

  public constructor(issues: string[]) {
    super(buildMessage(issues));
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

function buildMessage(issues: string[]): string {
  if (issues.length === 0) {
    return 'Configuration validation failed.';
  }

  return ['Configuration validation failed:', ...issues.map((issue) => `- ${issue}`)].join('\n');
}
