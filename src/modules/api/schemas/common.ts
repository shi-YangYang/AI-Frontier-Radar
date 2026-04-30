export const successResponseSchema = {
  type: 'object',
  required: ['ok', 'data'],
  properties: {
    ok: { const: true },
    data: { type: 'object' },
  },
} as const;

export const errorResponseSchema = {
  type: 'object',
  required: ['ok', 'error'],
  properties: {
    ok: { const: false },
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
} as const;
