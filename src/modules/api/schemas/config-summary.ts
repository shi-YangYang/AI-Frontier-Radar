export const configSummaryResponseSchema = {
  type: 'object',
  required: ['ok', 'data'],
  properties: {
    ok: { const: true },
    data: {
      type: 'object',
      required: [
        'pollIntervalSeconds',
        'fetchLimitPerAccount',
        'excludeReplies',
        'excludeReposts',
        'watchAccountsCount',
        'deliveryTargetsCount',
      ],
      properties: {
        pollIntervalSeconds: { type: 'number' },
        fetchLimitPerAccount: { type: 'number' },
        excludeReplies: { type: 'boolean' },
        excludeReposts: { type: 'boolean' },
        watchAccountsCount: { type: 'number' },
        deliveryTargetsCount: { type: 'number' },
        watchAccountsSource: { type: 'string' },
      },
    },
  },
} as const;
