import { randomUUID } from 'node:crypto';

import type { StorageContext } from '../storage';
import type { WechatBridgeService, WechatLoginState } from './wechat-bridge-service';
import { syncWechatDeliveryTargets } from './wechat-target-sync';

type BindingSession = { id: string; createdAt: number; failure?: WechatLoginState };

export class WechatBindCoordinator {
  private readonly sessions = new Map<string, BindingSession>();
  private readonly operations = new Map<string, Promise<unknown>>();
  private syncing: Promise<unknown> = Promise.resolve();

  public begin(userId: string): string {
    const id = randomUUID();
    this.sessions.set(userId, { id, createdAt: Date.now() });
    return id;
  }

  public getSessionId(userId: string): string | undefined {
    return this.sessions.get(userId)?.id;
  }

  public hasPendingBindings(): boolean {
    this.expireSessions();
    return [...this.sessions.values()].some((session) => session.failure === undefined);
  }

  private expireSessions(): void {
    for (const [userId, session] of this.sessions) {
      if (Date.now() - session.createdAt > 15 * 60_000) this.sessions.delete(userId);
    }
  }

  public clear(userId: string, sessionId: string): void {
    if (this.sessions.get(userId)?.id === sessionId) this.sessions.delete(userId);
  }

  // Serialize duplicate clicks/cancellation for one user, never across users.
  public async runForUser<T>(userId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.operations.get(userId) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(action);
    this.operations.set(userId, operation);
    try {
      return await operation;
    } finally {
      if (this.operations.get(userId) === operation) this.operations.delete(userId);
    }
  }

  public sync(service: WechatBridgeService, storage: StorageContext) {
    const operation = this.syncing.catch(() => undefined).then(async () => {
      this.expireSessions();
      const sessions = [...this.sessions.entries()];
      const states = new Map(await Promise.all(sessions.map(async ([userId, session]) => [
        userId, session.failure ?? await service.getLoginState(session.id),
      ] as const)));
      // A failed bridge request is not an empty account list: never remove targets on an outage.
      const accounts = await service.getAccounts();
      const owners = new Map<string, string>();
      for (const [userId, session] of sessions) {
        const state = states.get(userId);
        if (state?.status === 'failed') session.failure = state;
        if (this.sessions.get(userId) !== session || state?.status !== 'connected' || !state.accountId) continue;
        if (!owners.has(state.accountId) && await storage.users.findById(userId) !== null) {
          owners.set(state.accountId, userId);
        }
      }
      await syncWechatDeliveryTargets({
        accounts,
        bridgeBaseUrl: `http://127.0.0.1:${service.getStatus().port}/send`,
        deliveryTargets: storage.deliveryTargets,
        ownerUserIdsByAccountId: owners,
      });
      const wechatTargets = (await storage.deliveryTargets.listAll()).filter((target) => target.channelType === 'wechat_clawbot');
      for (const [userId, session] of sessions) {
        const state = states.get(userId);
        if (this.sessions.get(userId) !== session || state?.status !== 'connected' || !state.accountId) continue;
        const target = wechatTargets.find((entry) => entry.config.accountId === state.accountId);
        if (target?.ownerUserId === userId) {
          this.clear(userId, session.id);
        } else if (target?.ownerUserId) {
          session.failure = { loggedIn: false, status: 'failed', message: '该微信已绑定其他用户，请使用自己的微信重新扫码。' };
          states.set(userId, session.failure);
        }
      }
      return { accounts, states, wechatTargets };
    });
    this.syncing = operation;
    return operation;
  }
}
