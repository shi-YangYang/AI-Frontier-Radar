import { createBarkSender, type BarkSenderOptions } from './bark-sender';
import {
  createDeliveryChannelRegistry,
  type DeliveryChannelRegistry,
} from './delivery-channel';
import {
  createDingtalkWebhookSender,
  type DingtalkWebhookSenderOptions,
} from './dingtalk-webhook-sender';
import {
  createFeishuWebhookSender,
  type FeishuWebhookSenderOptions,
} from './feishu-webhook-sender';
import {
  createGenericWebhookSender,
  type GenericWebhookSenderOptions,
} from './generic-webhook-sender';
import {
  createWecomWebhookSender,
  type WecomWebhookSenderOptions,
} from './wecom-webhook-sender';

export interface DeliveryChannelRegistryOptions {
  bark?: BarkSenderOptions;
  dingtalk?: DingtalkWebhookSenderOptions;
  feishu?: FeishuWebhookSenderOptions;
  generic?: GenericWebhookSenderOptions;
  wecom?: WecomWebhookSenderOptions;
}

export function createDefaultDeliveryChannelRegistry(
  options: DeliveryChannelRegistryOptions = {},
): DeliveryChannelRegistry {
  return createDeliveryChannelRegistry([
    createFeishuWebhookSender(options.feishu),
    createWecomWebhookSender(options.wecom),
    createDingtalkWebhookSender(options.dingtalk),
    createBarkSender(options.bark),
    createGenericWebhookSender(options.generic),
  ]);
}
