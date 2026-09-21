import { computed, ref } from 'vue';

import {
  fetchAuthProviders,
  fetchCurrentUser,
  login as requestLogin,
  logout as requestLogout,
  type AuthProviders,
  type AuthUser,
} from './api/admin-api';

const currentUser = ref<AuthUser | null>(null);
const authProviders = ref<AuthProviders | null>(null);
const authResolved = ref(false);

export function useAuth() {
  return {
    authProviders,
    currentUser,
    isAdmin: computed(() => currentUser.value?.role === 'admin'),
    isAuthenticated: computed(() => currentUser.value !== null),
  };
}

export async function resolveAuthUser(force = false): Promise<AuthUser | null> {
  if (authResolved.value && !force) {
    return currentUser.value;
  }

  try {
    currentUser.value = await fetchCurrentUser();
  } catch {
    currentUser.value = null;
  }
  authResolved.value = true;

  return currentUser.value;
}

/** 预加载登录方式列表（钉钉入口等）；挂载前调用可避免登录按钮二次渲染闪烁。 */
export async function resolveAuthProviders(force = false): Promise<AuthProviders | null> {
  if (authProviders.value !== null && !force) {
    return authProviders.value;
  }

  try {
    authProviders.value = await fetchAuthProviders();
  } catch {
    authProviders.value = null;
  }

  return authProviders.value;
}

export async function signIn(username: string, password: string): Promise<AuthUser> {
  const user = await requestLogin(username, password);

  currentUser.value = user;
  authResolved.value = true;

  return user;
}

export async function signOut(): Promise<void> {
  try {
    await requestLogout();
  } finally {
    currentUser.value = null;
    authResolved.value = true;
  }
}

export function clearAuthUser(): void {
  currentUser.value = null;
  authResolved.value = true;
}
