export class WechatBindCoordinator {
  private pendingUserId: string | null = null;

  public begin(userId: string): void {
    this.pendingUserId = userId;
  }

  public clear(): void {
    this.pendingUserId = null;
  }

  public clearIfCreated(created: number): void {
    if (created > 0) {
      this.pendingUserId = null;
    }
  }

  public getPendingUserId(): string | null {
    return this.pendingUserId;
  }
}
