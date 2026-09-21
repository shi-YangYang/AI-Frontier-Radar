import { createHash, randomBytes } from 'node:crypto';

import type { AppLogger } from '../../lib/logger';
import type { StorageContext, User, UserRole } from '../storage';
import { generatePassword, hashPassword, verifyPassword } from './password';

export interface AuthServiceOptions {
  adminPassword?: string;
  adminUsername?: string;
  logger?: AppLogger;
  sessionTtlMs?: number;
  storage: StorageContext;
}

export interface LoginResult {
  token: string;
  user: User;
}

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 200;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export class AuthValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AuthValidationError';
  }
}

export class AuthService {
  private readonly adminPassword?: string;
  private readonly adminUsername?: string;
  private readonly logger?: AppLogger;
  private readonly sessionTtlMs: number;
  private readonly storage: StorageContext;

  public constructor(options: AuthServiceOptions) {
    this.adminPassword = normalizeAdminCredential(options.adminPassword);
    this.adminUsername = normalizeAdminCredential(options.adminUsername);
    this.logger = options.logger;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.storage = options.storage;
  }

  public async ensureSeedAdmin(): Promise<void> {
    const userCount = await this.storage.users.countAll();

    if (userCount > 0) {
      return;
    }

    const username = this.adminUsername ?? 'admin';
    const password = this.adminPassword ?? generatePassword(14);

    await this.storage.users.create({
      passwordHash: hashPassword(password),
      role: 'admin',
      username,
    });

    if (this.adminPassword === undefined) {
      this.logger?.warn?.(
        { username },
        `未配置 ADMIN_PASSWORD，已生成初始管理员密码：${password}（请登录后尽快修改）`,
      );
    } else {
      this.logger?.info?.({ username }, '已按 .env 配置创建初始管理员账号');
    }
  }

  public async login(username: string, password: string): Promise<LoginResult | null> {
    const user = await this.storage.users.findByUsername(username.trim());

    if (user === null || !verifyPassword(password, user.passwordHash)) {
      return null;
    }

    return this.issueSessionForUser(user);
  }

  /** 为已存在（或刚创建）的用户签发新会话；用户对象来自存储层。 */
  public async issueSessionForUser(user: {
    id: string;
  }): Promise<LoginResult> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.sessionTtlMs).toISOString();

    await this.storage.userSessions.create({
      expiresAt,
      id: hashSessionToken(token),
      userId: user.id,
    });

    const persisted = await this.storage.users.findById(user.id);

    if (persisted === null) {
      throw new AuthValidationError('用户不存在。');
    }

    return {
      token,
      user: persisted,
    };
  }

  public async logout(token: string): Promise<void> {
    await this.storage.userSessions.delete(hashSessionToken(token));
  }

  public async resolveSession(token: string): Promise<User | null> {
    const session = await this.storage.userSessions.findById(hashSessionToken(token));

    if (session === null) {
      return null;
    }

    if (Date.parse(session.expiresAt) <= Date.now()) {
      await this.storage.userSessions.delete(session.id);

      return null;
    }

    return this.storage.users.findById(session.userId);
  }

  public async listUsers(): Promise<User[]> {
    return this.storage.users.listAll();
  }

  public async createUser(input: {
    password: string;
    role: UserRole;
    username: string;
  }): Promise<User> {
    const username = input.username.trim();

    if (!USERNAME_PATTERN.test(username)) {
      throw new AuthValidationError('用户名需为 1-32 位字母、数字、下划线或短横线。');
    }

    validatePassword(input.password);

    if (input.role !== 'admin' && input.role !== 'user') {
      throw new AuthValidationError('角色必须是 admin 或 user。');
    }

    const existing = await this.storage.users.findByUsername(username);

    if (existing !== null) {
      throw new AuthValidationError('用户名已存在。');
    }

    return this.storage.users.create({
      passwordHash: hashPassword(input.password),
      role: input.role,
      username,
    });
  }

  public async deleteUser(id: string): Promise<boolean> {
    const user = await this.storage.users.findById(id);

    if (user === null) {
      return false;
    }

    if (user.role === 'admin' && (await this.storage.users.countByRole('admin')) <= 1) {
      throw new AuthValidationError('不能删除最后一个管理员。');
    }

    await this.storage.userSessions.deleteByUserId(id);
    await this.storage.deliveryTargets.clearOwner(id);

    return this.storage.users.delete(id);
  }

  public async resetPassword(id: string, password: string): Promise<boolean> {
    validatePassword(password);

    const updated = await this.storage.users.updatePassword(id, hashPassword(password));

    if (updated) {
      await this.storage.userSessions.deleteByUserId(id);
    }

    return updated;
  }
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  return new AuthService(options);
}

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthValidationError(`密码长度需为 ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} 位。`);
  }
}

function normalizeAdminCredential(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';

  return trimmed.length === 0 ? undefined : trimmed;
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
