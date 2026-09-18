import { createJsonHttpClient, type JsonHttpClient } from '../../../lib/http';
import type {
  DeliveryChannelSendInput,
  DeliveryChannelSendResult,
  DeliveryChannelSender,
} from './delivery-channel';
import {
  createChannelFailure,
  createChannelSuccess,
  toChannelErrorResult,
} from './delivery-channel';

export interface BarkSenderOptions {
  httpClientFactory?: (originUrl: string) => JsonHttpClient;
  timeoutMs?: number;
}

interface BarkResponseBody {
  code?: number;
  message?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class BarkSender implements DeliveryChannelSender {
  public readonly channelType = 'bark' as const;
  private readonly httpClientFactory: (originUrl: string) => JsonHttpClient;
  private readonly timeoutMs: number;

  public constructor(options: BarkSenderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.httpClientFactory =
      options.httpClientFactory ??
      ((originUrl) => createJsonHttpClient({ baseUrl: originUrl, timeoutMs: this.timeoutMs }));
  }

  public async send(input: DeliveryChannelSendInput): Promise<DeliveryChannelSendResult> {
    try {
      const { origin, path } = splitBarkEndpoint(input.webhookUrl);
      const response = await this.httpClientFactory(origin).requestJson<BarkResponseBody>({
        jsonBody: {
          body: input.message.text,
          title: input.message.title,
          url: input.message.url,
        },
        method: 'POST',
        path,
      });

      if (response.code !== 200) {
        return createChannelFailure({
          channel: this.channelType,
          code: 'BARK_RESPONSE_ERROR',
          diagnostics: { providerCode: response.code, providerMessage: response.message },
          message: `Bark 返回错误（code=${String(response.code)}）。`,
          retryable: false,
          targetKey: input.targetKey,
        });
      }

      return createChannelSuccess({
        channel: this.channelType,
        message: 'Bark 已接收通知。',
        ...(response.code === undefined ? {} : { providerCode: response.code }),
        ...(response.message === undefined ? {} : { providerMessage: response.message }),
        targetKey: input.targetKey,
      });
    } catch (error) {
      if (error instanceof BarkUrlError) {
        return createChannelFailure({
          channel: this.channelType,
          code: 'BARK_INVALID_URL',
          diagnostics: { endpoint: input.webhookUrl },
          message: error.message,
          retryable: false,
          targetKey: input.targetKey,
        });
      }

      return toChannelErrorResult({
        channel: this.channelType,
        codePrefix: 'BARK',
        error,
        sendInput: input,
      });
    }
  }
}

export function createBarkSender(options: BarkSenderOptions = {}): DeliveryChannelSender {
  return new BarkSender(options);
}

class BarkUrlError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BarkUrlError';
  }
}

function splitBarkEndpoint(webhookUrl: string): { origin: string; path: string } {
  let url: URL;

  try {
    url = new URL(webhookUrl);
  } catch {
    throw new BarkUrlError('Bark 推送地址不是有效的 URL。');
  }

  if (url.pathname === '/' || url.pathname.length === 0) {
    throw new BarkUrlError('Bark 推送地址需要包含设备 Key，例如 https://api.day.app/<deviceKey>。');
  }

  return { origin: url.origin, path: url.pathname };
}
