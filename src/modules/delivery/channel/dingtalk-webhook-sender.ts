import { createHmac } from 'node:crypto';

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

export interface DingtalkWebhookSenderOptions {
  httpClientFactory?: (webhookUrl: string) => JsonHttpClient;
  now?: () => Date;
  timeoutMs?: number;
}

interface DingtalkResponseBody {
  errcode?: number;
  errmsg?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class DingtalkWebhookSender implements DeliveryChannelSender {
  public readonly channelType = 'dingtalk_webhook' as const;
  private readonly httpClientFactory: (webhookUrl: string) => JsonHttpClient;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  public constructor(options: DingtalkWebhookSenderOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.httpClientFactory =
      options.httpClientFactory ??
      ((webhookUrl) => createJsonHttpClient({ baseUrl: webhookUrl, timeoutMs: this.timeoutMs }));
  }

  public async send(input: DeliveryChannelSendInput): Promise<DeliveryChannelSendResult> {
    const secret = input.config.secret?.trim() ?? '';
    const query =
      secret.length === 0 ? undefined : buildSignatureQuery(secret, this.now().getTime());

    try {
      const response = await this.httpClientFactory(input.webhookUrl).requestJson<DingtalkResponseBody>({
        jsonBody: {
          markdown: {
            text: input.message.text,
            title: input.message.title,
          },
          msgtype: 'markdown',
        },
        method: 'POST',
        path: '',
        ...(query === undefined ? {} : { query }),
      });

      if (response.errcode !== 0) {
        return createChannelFailure({
          channel: this.channelType,
          code: 'DINGTALK_RESPONSE_ERROR',
          diagnostics: { providerCode: response.errcode, providerMessage: response.errmsg },
          message: `DingTalk webhook rejected the message (errcode=${String(response.errcode)}).`,
          retryable: false,
          targetKey: input.targetKey,
        });
      }

      return createChannelSuccess({
        channel: this.channelType,
        message: 'DingTalk webhook accepted the message.',
        ...(response.errcode === undefined ? {} : { providerCode: response.errcode }),
        ...(response.errmsg === undefined ? {} : { providerMessage: response.errmsg }),
        targetKey: input.targetKey,
      });
    } catch (error) {
      return toChannelErrorResult({
        channel: this.channelType,
        codePrefix: 'DINGTALK',
        error,
        sendInput: input,
      });
    }
  }
}

export function createDingtalkWebhookSender(
  options: DingtalkWebhookSenderOptions = {},
): DeliveryChannelSender {
  return new DingtalkWebhookSender(options);
}

export function buildSignatureQuery(
  secret: string,
  timestampMs: number,
): { sign: string; timestamp: string } {
  const timestamp = String(timestampMs);
  const sign = createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64');

  return { sign, timestamp };
}
