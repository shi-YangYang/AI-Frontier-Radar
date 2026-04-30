import { createJsonHttpClient, HttpRequestError, type JsonHttpClient } from '../../../lib/http';

export interface FeishuWebhookTarget {
  targetKey: string;
  webhookUrl: string;
}

export interface FeishuWebhookTextMessage {
  content: {
    text: string;
  };
  msg_type: 'text';
}

export interface FeishuWebhookSendTextInput extends FeishuWebhookTarget {
  text: string;
}

export type FeishuWebhookErrorCode =
  | 'FEISHU_WEBHOOK_HTTP_ERROR'
  | 'FEISHU_WEBHOOK_REQUEST_FAILED'
  | 'FEISHU_WEBHOOK_RESPONSE_ERROR'
  | 'FEISHU_WEBHOOK_RESPONSE_INVALID';

export interface FeishuWebhookErrorDiagnostics {
  causeMessage?: string;
  endpoint: string;
  httpStatusCode?: number;
  providerCode?: number;
  providerMessage?: string;
  responseBodySnippet?: string;
}

export interface FeishuWebhookSuccessResult {
  channel: 'feishu_webhook';
  message: string;
  ok: true;
  providerCode: number;
  providerMessage?: string;
  providerResponse: FeishuWebhookResponseBody;
  targetKey: string;
}

export interface FeishuWebhookFailureResult {
  channel: 'feishu_webhook';
  error: {
    code: FeishuWebhookErrorCode;
    diagnostics: FeishuWebhookErrorDiagnostics;
    message: string;
    retryable: boolean;
  };
  ok: false;
  targetKey: string;
}

export type FeishuWebhookSendResult = FeishuWebhookFailureResult | FeishuWebhookSuccessResult;

export interface FeishuWebhookClientOptions {
  fetchImplementation?: typeof fetch;
  httpClientFactory?: (webhookUrl: string) => JsonHttpClient;
  timeoutMs?: number;
}

interface FeishuWebhookResponseBody {
  StatusCode?: number;
  StatusMessage?: string;
  code?: number;
  data?: unknown;
  msg?: string;
}

const SUCCESS_CODE = 0;

export class FeishuWebhookClient {
  private readonly clients = new Map<string, JsonHttpClient>();

  public constructor(private readonly options: FeishuWebhookClientOptions = {}) {}

  public async sendTextMessage(input: FeishuWebhookSendTextInput): Promise<FeishuWebhookSendResult> {
    const message = createFeishuTextMessage(input.text);
    const endpoint = sanitizeWebhookUrl(input.webhookUrl);

    try {
      const response = await this.getHttpClient(input.webhookUrl).requestJson<FeishuWebhookResponseBody>({
        jsonBody: message,
        method: 'POST',
        path: '',
        timeoutMs: this.options.timeoutMs,
      });
      const providerCode = resolveProviderCode(response);
      const providerMessage = resolveProviderMessage(response);

      if (providerCode === undefined) {
        return {
          channel: 'feishu_webhook',
          error: {
            code: 'FEISHU_WEBHOOK_RESPONSE_INVALID',
            diagnostics: {
              endpoint,
              providerMessage,
            },
            message: 'Feishu webhook returned an invalid response body.',
            retryable: false,
          },
          ok: false,
          targetKey: input.targetKey,
        };
      }

      if (providerCode !== SUCCESS_CODE) {
        return {
          channel: 'feishu_webhook',
          error: {
            code: 'FEISHU_WEBHOOK_RESPONSE_ERROR',
            diagnostics: {
              endpoint,
              providerCode,
              providerMessage,
            },
            message: providerMessage ?? `Feishu webhook returned error code ${providerCode}.`,
            retryable: false,
          },
          ok: false,
          targetKey: input.targetKey,
        };
      }

      return {
        channel: 'feishu_webhook',
        message: providerMessage ?? 'success',
        ok: true,
        providerCode,
        providerMessage,
        providerResponse: response,
        targetKey: input.targetKey,
      };
    } catch (error) {
      return mapWebhookRequestFailure(error, {
        endpoint,
        targetKey: input.targetKey,
      });
    }
  }

  private getHttpClient(webhookUrl: string): JsonHttpClient {
    const cachedClient = this.clients.get(webhookUrl);

    if (cachedClient !== undefined) {
      return cachedClient;
    }

    const client =
      this.options.httpClientFactory?.(webhookUrl) ??
      createJsonHttpClient({
        baseUrl: webhookUrl,
        fetchImplementation: this.options.fetchImplementation,
        timeoutMs: this.options.timeoutMs,
      });

    this.clients.set(webhookUrl, client);
    return client;
  }
}

export function createFeishuWebhookClient(
  options: FeishuWebhookClientOptions = {},
): FeishuWebhookClient {
  return new FeishuWebhookClient(options);
}

export function createFeishuTextMessage(text: string): FeishuWebhookTextMessage {
  return {
    content: {
      text,
    },
    msg_type: 'text',
  };
}

function mapWebhookRequestFailure(
  error: unknown,
  context: {
    endpoint: string;
    targetKey: string;
  },
): FeishuWebhookFailureResult {
  if (error instanceof HttpRequestError) {
    if (error.statusCode !== undefined && error.statusCode >= 200 && error.statusCode < 300) {
      return {
        channel: 'feishu_webhook',
        error: {
          code: 'FEISHU_WEBHOOK_RESPONSE_INVALID',
          diagnostics: {
            causeMessage: error.message,
            endpoint: context.endpoint,
            httpStatusCode: error.statusCode,
            responseBodySnippet: error.bodySnippet,
          },
          message: 'Feishu webhook returned a non-JSON success response.',
          retryable: false,
        },
        ok: false,
        targetKey: context.targetKey,
      };
    }

    return {
      channel: 'feishu_webhook',
      error: {
        code: error.statusCode === undefined ? 'FEISHU_WEBHOOK_REQUEST_FAILED' : 'FEISHU_WEBHOOK_HTTP_ERROR',
        diagnostics: {
          causeMessage: error.message,
          endpoint: context.endpoint,
          httpStatusCode: error.statusCode,
          responseBodySnippet: error.bodySnippet,
        },
        message: error.message,
        retryable: isRetryableHttpFailure(error.statusCode),
      },
      ok: false,
      targetKey: context.targetKey,
    };
  }

  return {
    channel: 'feishu_webhook',
    error: {
      code: 'FEISHU_WEBHOOK_REQUEST_FAILED',
      diagnostics: {
        causeMessage: error instanceof Error ? error.message : String(error),
        endpoint: context.endpoint,
      },
      message: 'Feishu webhook request failed before receiving a valid response.',
      retryable: true,
    },
    ok: false,
    targetKey: context.targetKey,
  };
}

function resolveProviderCode(response: FeishuWebhookResponseBody): number | undefined {
  if (typeof response.code === 'number') {
    return response.code;
  }

  if (typeof response.StatusCode === 'number') {
    return response.StatusCode;
  }

  return undefined;
}

function resolveProviderMessage(response: FeishuWebhookResponseBody): string | undefined {
  if (isPresent(response.msg)) {
    return response.msg;
  }

  if (isPresent(response.StatusMessage)) {
    return response.StatusMessage;
  }

  return undefined;
}

function sanitizeWebhookUrl(webhookUrl: string): string {
  try {
    const url = new URL(webhookUrl);
    const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
    const lastSegment = segments.at(-1);

    if (lastSegment === undefined) {
      return url.origin;
    }

    const redactedLastSegment =
      lastSegment.length <= 6 ? '[REDACTED]' : `${lastSegment.slice(0, 2)}***${lastSegment.slice(-4)}`;
    const redactedPath = [...segments.slice(0, -1), redactedLastSegment].join('/');

    return `${url.origin}/${redactedPath}`;
  } catch {
    return '[INVALID_WEBHOOK_URL]';
  }
}

function isRetryableHttpFailure(statusCode: number | undefined): boolean {
  if (statusCode === undefined) {
    return true;
  }

  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function isPresent(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
