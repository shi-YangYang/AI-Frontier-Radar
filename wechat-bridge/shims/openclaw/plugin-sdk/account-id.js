export function normalizeAccountId(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  const replacedSuffix = raw
    .replace(/@im\.bot$/u, '-im-bot')
    .replace(/@im\.wechat$/u, '-im-wechat');
  const sanitized = replacedSuffix.replace(/[^a-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '');

  return sanitized.length === 0 ? 'default' : sanitized;
}
