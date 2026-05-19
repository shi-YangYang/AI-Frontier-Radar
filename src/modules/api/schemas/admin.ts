import { errorResponseSchema } from './common';

export const adminSuccessResponseSchema = {
  type: 'object',
  required: ['ok', 'data'],
  properties: {
    ok: { const: true },
    data: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const adminErrorResponseSchema = errorResponseSchema;

export const adminJsonResponseSchema = {
  200: adminSuccessResponseSchema,
  400: adminErrorResponseSchema,
  403: adminErrorResponseSchema,
  404: adminErrorResponseSchema,
  409: adminErrorResponseSchema,
  500: adminErrorResponseSchema,
  502: adminErrorResponseSchema,
  503: adminErrorResponseSchema,
} as const;
