import { computed, ref } from 'vue';

import {
  fetchCurrentUser,
  login as requestLogin,
  logout as requestLogout,
  type AuthUser,
} from './api/admin-api';

const currentUser = ref<AuthUser | null>(null);
const authResolved = ref(false);

export function useAuth() {
  return {
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
