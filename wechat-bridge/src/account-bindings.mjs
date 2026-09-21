export function saveWechatBinding(accounts, result, onRemoveAccount) {
  accounts.saveWeixinAccount(result.accountId, {
    baseUrl: result.baseUrl, token: result.botToken, userId: result.userId,
  });
  accounts.registerWeixinAccountId(result.accountId);
  accounts.clearStaleAccountsForUserId(result.accountId, result.userId?.trim(), onRemoveAccount);
}

// Repair bindings left by older versions; never combine accounts without a known WeChat user ID.
export function pruneStaleWechatBindings(accounts, onRemoveAccount) {
  const latestByUser = new Map();
  for (const accountId of accounts.listIndexedWeixinAccountIds()) {
    const account = accounts.loadWeixinAccount(accountId);
    const userId = account?.userId?.trim();
    if (!userId || !account.token?.trim()) continue;
    const savedAt = Date.parse(account.savedAt) || 0;
    const previous = latestByUser.get(userId);
    if (!previous || savedAt >= previous.savedAt) latestByUser.set(userId, { accountId, savedAt });
  }
  for (const [userId, { accountId }] of latestByUser) {
    accounts.clearStaleAccountsForUserId(accountId, userId, onRemoveAccount);
  }
}
