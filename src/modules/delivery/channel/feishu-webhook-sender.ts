import type { DeliveryChannelSendInput, DeliveryChannelSendResult, DeliveryChannelSender } from './delivery-channel';
import { createChannelFailure, createChannelSuccess, toChannelErrorResult } from './delivery-channel';
import type { FeishuWebhookClient } from './feishu-webhook-client';
import { createFeishuWebhookClient, type FeishuWebhookClientOptions } from './feishu-webhook-client';

export interface FeishuWebhookSenderOptions {
  client?: FeishuWebhookClient;
  clientOptions?: FeishuWebhookClientOptions;
}

export class FeishuWebhookSender implements DeliveryChannelSender {
  public readonly channelType = 'feishu_webhook' as const;
  private readonly client: FeishuWebhookClient;

  public constructor(options: FeishuWebhookSenderOptions = {}) {
    this.client = options.client ?? createFeishuWebhookClient(options.clientOptions);
  }

  public async send(input: DeliveryChannelSendInput): Promise<DeliveryChannelSendResult> {
    try {
      const result = await this.client.sendTextMessage({
        targetKey: input.targetKey,
        text: input.message.text,
        webhookUrl: input.webhookUrl,
      });

      if (!result.ok) {
        return createChannelFailure({
          channel: this.channelType,
          code: result.error.code,
          diagnostics: { ...result.error.diagnostics },
          message: result.error.message,
          retryable: result.error.retryable,
          targetKey: input.targetKey,
        });
      }

      return createChannelSuccess({
        channel: this.channelType,
        message: result.message,
        providerCode: result.providerCode,
        ...(result.providerMessage === undefined ? {} : { providerMessage: result.providerMessage }),
        targetKey: input.targetKey,
      });
    } catch (error) {
      return toChannelErrorResult({
        channel: this.channelType,
        codePrefix: 'FEISHU_WEBHOOK',
        error,
        sendInput: input,
      });
    }
  }
}

export function createFeishuWebhookSender(
  options: FeishuWebhookSenderOptions = {},
): DeliveryChannelSender {
  return new FeishuWebhookSender(options);
}
