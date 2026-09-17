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

export interface WecomWebhookSenderOptions {
  httpClientFactory?: (webhookUrl: string) => JsonHttpClient;
  timeoutMs?: number;
}

interface WecomResponseBody {
  errcode?: number;
  errmsg?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class WecomWebhookSender implements DeliveryChannelSender {
  public readonly channelType = 'wecom_webhook' as const;
  private readonly httpClientFactory: (webhookUrl: string) => JsonHttpClient;
  private readonly timeoutMs: number;

  public constructor(options: WecomWebhookSenderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.httpClientFactory =
      options.httpClientFactory ??
      ((webhookUrl) => createJsonHttpClient({ baseUrl: webhookUrl, timeoutMs: this.timeoutMs }));
  }

  public async send(input: DeliveryChannelSendInput): Promise<DeliveryChannelSendResult> {
    try {
      const response = await this.httpClientFactory(input.webhookUrl).requestJson<WecomResponseBody>({
        jsonBody: {
          markdown: {
            content: input.message.text,
          },
          msgtype: 'markdown',
        },
        method: 'POST',
        path: '',
      });

      if (response.errcode !== 0) {
        return createChannelFailure({
          channel: this.channelType,
          code: 'WECOM_RESPONSE_ERROR',
          diagnostics: { providerCode: response.errcode, providerMessage: response.errmsg },
          message: `WeCom webhook rejected the message (errcode=${String(response.errcode)}).`,
          retryable: false,
          targetKey: input.targetKey,
        });
      }

      return createChannelSuccess({
        channel: this.channelType,
        message: 'WeCom webhook accepted the message.',
        ...(response.errcode === undefined ? {} : { providerCode: response.errcode }),
        ...(response.errmsg === undefined ? {} : { providerMessage: response.errmsg }),
        targetKey: input.targetKey,
      });
    } catch (error) {
      return toChannelErrorResult({
        channel: this.channelType,
        codePrefix: 'WECOM',
        error,
        sendInput: input,
      });
    }
  }
}

export function createWecomWebhookSender(
  options: WecomWebhookSenderOptions = {},
): DeliveryChannelSender {
  return new WecomWebhookSender(options);
}
