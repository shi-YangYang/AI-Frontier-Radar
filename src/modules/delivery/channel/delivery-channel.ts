import { HttpRequestError } from '../../../lib/http';
import type { DeliveryChannelType, DeliveryTargetConfig } from '../../storage/types';

export interface DeliveryChannelMessage {
  author: string;
  postedAt: string;
  text: string;
  title: string;
  url: string;
}

export interface DeliveryChannelSendInput {
  config: DeliveryTargetConfig;
  message: DeliveryChannelMessage;
  targetKey: string;
  webhookUrl: string;
}

export interface DeliveryChannelError {
  code: string;
  diagnostics: Record<string, unknown>;
  message: string;
  retryable: boolean;
}

export type DeliveryChannelSendResult =
  | {
      channel: DeliveryChannelType;
      message: string;
      ok: true;
      providerCode?: number;
      providerMessage?: string;
      targetKey: string;
    }
  | {
      channel: DeliveryChannelType;
      error: DeliveryChannelError;
      ok: false;
      targetKey: string;
    };

export interface DeliveryChannelSender {
  readonly channelType: DeliveryChannelType;
  send(input: DeliveryChannelSendInput): Promise<DeliveryChannelSendResult>;
}

export interface DeliveryChannelRegistry {
  channels(): DeliveryChannelSender[];
  get(channelType: string): DeliveryChannelSender | undefined;
}

export function createDeliveryChannelRegistry(
  senders: DeliveryChannelSender[],
): DeliveryChannelRegistry {
  const byChannelType = new Map<string, DeliveryChannelSender>(
    senders.map((sender) => [sender.channelType, sender]),
  );

  return {
    channels(): DeliveryChannelSender[] {
      return [...byChannelType.values()];
    },
    get(channelType: string): DeliveryChannelSender | undefined {
      return byChannelType.get(channelType);
    },
  };
}

export function createChannelFailure(input: {
  channel: DeliveryChannelType;
  code: string;
  diagnostics?: Record<string, unknown>;
  message: string;
  retryable: boolean;
  targetKey: string;
}): DeliveryChannelSendResult {
  return {
    channel: input.channel,
    error: {
      code: input.code,
      diagnostics: input.diagnostics ?? {},
      message: input.message,
      retryable: input.retryable,
    },
    ok: false,
    targetKey: input.targetKey,
  };
}

export function toChannelErrorResult(input: {
  channel: DeliveryChannelType;
  codePrefix: string;
  error: unknown;
  sendInput: DeliveryChannelSendInput;
}): DeliveryChannelSendResult {
  if (input.error instanceof HttpRequestError) {
    const statusCode = input.error.statusCode;
    const retryable = statusCode === undefined || statusCode >= 500;

    return createChannelFailure({
      channel: input.channel,
      code: `${input.codePrefix}_HTTP_ERROR`,
      diagnostics: {
        bodySnippet: input.error.bodySnippet,
        endpoint: input.sendInput.webhookUrl,
        httpStatusCode: statusCode,
      },
      message: input.error.message,
      retryable,
      targetKey: input.sendInput.targetKey,
    });
  }

  const message = input.error instanceof Error ? input.error.message : String(input.error);

  return createChannelFailure({
    channel: input.channel,
    code: `${input.codePrefix}_REQUEST_FAILED`,
    diagnostics: {
      causeMessage: message,
      endpoint: input.sendInput.webhookUrl,
    },
    message,
    retryable: true,
    targetKey: input.sendInput.targetKey,
  });
}

export function createChannelSuccess(input: {
  channel: DeliveryChannelType;
  message: string;
  providerCode?: number;
  providerMessage?: string;
  targetKey: string;
}): DeliveryChannelSendResult {
  return {
    channel: input.channel,
    message: input.message,
    ok: true,
    ...(input.providerCode === undefined ? {} : { providerCode: input.providerCode }),
    ...(input.providerMessage === undefined ? {} : { providerMessage: input.providerMessage }),
    targetKey: input.targetKey,
  };
}
