import type {
  DeliveryChannelSendInput,
  DeliveryChannelSendResult,
  DeliveryChannelSender,
} from './delivery-channel';
import { createChannelFailure, createChannelSuccess, toChannelErrorResult } from './delivery-channel';

export interface GenericWebhookSenderOptions {
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class GenericWebhookSender implements DeliveryChannelSender {
  public readonly channelType = 'generic_webhook' as const;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(options: GenericWebhookSenderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async send(input: DeliveryChannelSendInput): Promise<DeliveryChannelSendResult> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(input.webhookUrl, {
        body: JSON.stringify({
          author: input.message.author,
          postedAt: input.message.postedAt,
          text: input.message.text,
          title: input.message.title,
          url: input.message.url,
        }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodySnippet = await response
          .text()
          .then((value) => value.slice(0, 500))
          .catch(() => '');

        return createChannelFailure({
          channel: this.channelType,
          code: 'GENERIC_WEBHOOK_HTTP_ERROR',
          diagnostics: {
            bodySnippet,
            endpoint: input.webhookUrl,
            httpStatusCode: response.status,
          },
          message: `Generic webhook returned HTTP ${response.status}.`,
          retryable: response.status >= 500,
          targetKey: input.targetKey,
        });
      }

      return createChannelSuccess({
        channel: this.channelType,
        message: `Generic webhook accepted the message (HTTP ${response.status}).`,
        providerCode: response.status,
        targetKey: input.targetKey,
      });
    } catch (error) {
      return toChannelErrorResult({
        channel: this.channelType,
        codePrefix: 'GENERIC_WEBHOOK',
        error,
        sendInput: input,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createGenericWebhookSender(
  options: GenericWebhookSenderOptions = {},
): DeliveryChannelSender {
  return new GenericWebhookSender(options);
}
