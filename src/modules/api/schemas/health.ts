import { errorResponseSchema } from './common';

export const healthResponseSchema = {
  type: 'object',
  required: ['ok', 'data'],
  properties: {
    ok: { const: true },
    data: {
      type: 'object',
      required: ['status', 'service', 'time'],
      properties: {
        status: { const: 'ok' },
        service: { type: 'string' },
        time: { type: 'string' },
      },
    },
  },
} as const;

export const readySuccessResponseSchema = {
  type: 'object',
  required: ['ok', 'data'],
  properties: {
    ok: { const: true },
    data: {
      type: 'object',
      required: ['status', 'database', 'queue', 'config'],
      properties: {
        status: { const: 'ready' },
        database: { const: 'ok' },
        queue: { const: 'ok' },
        config: { const: 'ok' },
      },
    },
  },
} as const;

export const readyErrorResponseSchema = errorResponseSchema;
