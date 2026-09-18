import type {
  DeliveryChannelSendInput,
  DeliveryChannelSendResult,
  DeliveryChannelSender,
} from './delivery-channel';
import { createChannelFailure, createChannelSuccess, toChannelErrorResult } from './delivery-channel';

export interface WechatBridgeSenderOptions {
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

interface WechatBridgeResponseBody {
  error?: string;
  messageId?: string;
  ok?: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class WechatBridgeSender implements DeliveryChannelSender {
  public readonly channelType = 'wechat_clawbot' as const;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(options: WechatBridgeSenderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async send(input: DeliveryChannelSendInput): Promise<DeliveryChannelSendResult> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    const secret = input.config.secret?.trim() ?? '';
    const target = input.config.target?.trim() ?? '';
    const accountId = input.config.accountId?.trim() ?? '';

    try {
      const response = await this.fetchImplementation(input.webhookUrl, {
        body: JSON.stringify({
          ...(accountId.length === 0 ? {} : { accountId }),
          author: input.message.author,
          postedAt: input.message.postedAt,
          text: input.message.text,
          title: input.message.title,
          ...(target.length === 0 ? {} : { to: target }),
          url: input.message.url,
        }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(secret.length === 0 ? {} : { Authorization: `Bearer ${secret}` }),
        },
        method: 'POST',
        signal: controller.signal,
      });

      const rawBody = await response.text().catch(() => '');
      const parsedBody = parseBridgeBody(rawBody);

      if (!response.ok || parsedBody?.ok === false) {
        const providerMessage =
          parsedBody?.error ?? (rawBody.length > 0 ? rawBody.slice(0, 300) : `HTTP ${response.status}`);

        return createChannelFailure({
          channel: this.channelType,
          code: 'WECHAT_BRIDGE_HTTP_ERROR',
          diagnostics: {
            bodySnippet: rawBody.slice(0, 500),
            endpoint: input.webhookUrl,
            httpStatusCode: response.status,
          },
          message: `微信桥返回失败：${providerMessage}`,
          retryable: response.status >= 500,
          targetKey: input.targetKey,
        });
      }

      return createChannelSuccess({
        channel: this.channelType,
        message: '微信桥已接受消息。',
        providerCode: response.status,
        ...(parsedBody?.messageId === undefined ? {} : { providerMessage: parsedBody.messageId }),
        targetKey: input.targetKey,
      });
    } catch (error) {
      return toChannelErrorResult({
        channel: this.channelType,
        codePrefix: 'WECHAT_BRIDGE',
        error,
        sendInput: input,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createWechatBridgeSender(
  options: WechatBridgeSenderOptions = {},
): DeliveryChannelSender {
  return new WechatBridgeSender(options);
}

function parseBridgeBody(rawBody: string): WechatBridgeResponseBody | undefined {
  try {
    const parsed = JSON.parse(rawBody) as unknown;

    return typeof parsed === 'object' && parsed !== null ? (parsed as WechatBridgeResponseBody) : undefined;
  } catch {
    return undefined;
  }
}
