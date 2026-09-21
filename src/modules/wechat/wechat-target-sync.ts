import type { DeliveryTargetRepository } from '../storage';
import type { DeliveryTarget, DeliveryTargetConfig } from '../storage/types';
import type { WechatAccount } from './wechat-bridge-service';

export interface SyncWechatDeliveryTargetsOptions {
  bridgeBaseUrl?: string;
  deliveryTargets: DeliveryTargetRepository;
  accounts: WechatAccount[];
  ownerUserIdsByAccountId?: ReadonlyMap<string, string>;
}

export interface SyncWechatDeliveryTargetsResult {
  created: number;
  removed: number;
  updated: number;
}

const DEFAULT_BRIDGE_SEND_URL = 'http://127.0.0.1:3991/send';

export async function syncWechatDeliveryTargets(
  options: SyncWechatDeliveryTargetsOptions,
): Promise<SyncWechatDeliveryTargetsResult> {
  const result: SyncWechatDeliveryTargetsResult = { created: 0, removed: 0, updated: 0 };
  const knownTargets = await options.deliveryTargets.listAll();
  const wechatTargets = knownTargets.filter((target) => target.channelType === 'wechat_clawbot');
  const accountIds = new Set(options.accounts.map((account) => account.accountId));

  // Retire old channels and their queued deliveries before publishing replacement channels.
  for (const target of wechatTargets) {
    const accountId = target.config.accountId;
    if (accountId === undefined || accountId.length === 0) continue;
    if (accountIds.has(accountId) && target.targetKey === buildWechatTargetKey(accountId)) continue;
    const deleted = await options.deliveryTargets.delete(target.id);
    if (deleted.deleted) result.removed += 1;
  }

  for (const account of options.accounts) {
    const targetKey = buildWechatTargetKey(account.accountId);
    const existing = wechatTargets.find((target) => target.targetKey === targetKey)
      ?? await options.deliveryTargets.findByTargetKey(targetKey) ?? undefined;
    const displayName = `微信 ${account.userId ?? account.accountId}`;
    const config: DeliveryTargetConfig = {
      accountId: account.accountId,
      ...(account.userId === null ? {} : { target: account.userId }),
    };
    const webhookUrl = options.bridgeBaseUrl ?? DEFAULT_BRIDGE_SEND_URL;
    const ownerUserId = options.ownerUserIdsByAccountId?.get(account.accountId);

    if (existing === undefined) {
      await options.deliveryTargets.create({
        channelType: 'wechat_clawbot',
        config,
        displayName,
        enabled: true,
        ownerUserId: ownerUserId ?? null,
        targetKey,
        webhookUrl,
      });
      result.created += 1;
      continue;
    }

    // Deleted channels can remain for delivery history; reuse their unique key on a confirmed return.
    if (existing.webhookUrl === '') {
      await options.deliveryTargets.update(existing.id, {
        config,
        displayName,
        enabled: true,
        ownerUserId: ownerUserId ?? null,
        webhookUrl,
      });
      result.updated += 1;
      continue;
    }

    const shouldClaimOwner =
      existing.ownerUserId === null &&
      ownerUserId !== undefined;

    if (
      existing.displayName !== displayName ||
      existing.webhookUrl !== webhookUrl ||
      existing.config.accountId !== config.accountId ||
      existing.config.target !== config.target ||
      shouldClaimOwner
    ) {
      await options.deliveryTargets.update(existing.id, {
        config: { ...existing.config, ...config },
        displayName,
        webhookUrl,
        ...(shouldClaimOwner ? { ownerUserId } : {}),
      });
      result.updated += 1;
    }
  }

  return result;
}

export function buildWechatTargetKey(accountId: string): string {
  return `wechat:${accountId}`;
}

export function findWechatTarget(
  targets: DeliveryTarget[],
  accountId: string,
): DeliveryTarget | undefined {
  const targetKey = buildWechatTargetKey(accountId);

  return (
    targets.find((target) => target.targetKey === targetKey) ??
    targets.find(
      (target) => target.channelType === 'wechat_clawbot' && target.config.accountId === accountId,
    )
  );
}
