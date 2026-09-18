<template>
  <div class="portal-shell">
    <header class="portal-header">
      <div class="portal-brand">
        <BrandLogo :alt="t('brand.name')" class="portal-logo" />
        <div>
          <strong>{{ t('brand.name') }}</strong>
          <small>{{ t('portal.subtitle') }}</small>
        </div>
      </div>
      <div class="portal-header-actions">
        <span v-if="currentUser !== null" class="portal-user">
          {{ t('portal.signedInAs') }} <strong>{{ currentUser.username }}</strong>
        </span>
        <button class="language-button" type="button" @click="toggleLanguage">
          {{ t('language.switchTo') }}
        </button>
        <button type="button" @click="handleLogout">{{ t('auth.logout') }}</button>
      </div>
    </header>

    <main class="portal-content">
      <ToastNotice :message="notice" :danger="noticeDanger" />

      <section class="panel">
        <header class="panel-header">
          <div>
            <h2>{{ t('portal.wechatTitle') }}</h2>
            <p>{{ t('portal.wechatDescription') }}</p>
          </div>
          <button
            class="primary"
            type="button"
            :disabled="busy || qrVisible"
            @click="startBind"
          >
            {{ t('portal.bindAction') }}
          </button>
        </header>

        <div v-if="binding === null" class="empty-panel">{{ t('portal.loading') }}</div>

        <div v-else-if="binding.accounts.length === 0 && !qrVisible" class="empty-panel">
          {{ t('portal.noBindings') }}
        </div>

        <div v-else class="portal-account-list">
          <article v-for="account in binding.accounts" :key="account.accountId" class="portal-account">
            <div>
              <strong>{{ account.userId ?? account.accountId }}</strong>
              <small class="muted">{{ t('portal.accountId') }}：{{ account.accountId }}</small>
            </div>
            <div class="portal-account-actions">
              <span class="status-badge" :class="account.enabled ? 'good' : 'neutral'">
                {{ account.enabled ? t('portal.pushOn') : t('portal.pushOff') }}
              </span>
              <button class="danger" type="button" :disabled="busy" @click="accountToUnbind = account">
                {{ t('portal.unbindAction') }}
              </button>
            </div>
          </article>
        </div>

        <div v-if="qrVisible" class="portal-qr-block">
          <p class="muted">{{ t('portal.scanHint') }}</p>
          <img v-if="qrDataUrl !== null" :src="qrDataUrl" alt="WeChat login QR" class="wechat-qr-image" />
          <a v-if="qrUrl !== null" :href="qrUrl" rel="noreferrer" target="_blank">{{ t('portal.openQrLink') }}</a>
          <form v-if="loginStatus === 'need-code'" class="settings-form" @submit.prevent="submitCode">
            <label>
              <span>{{ t('portal.codeLabel') }}</span>
              <input v-model="codeInput" autocomplete="off" :placeholder="t('portal.codePlaceholder')" />
            </label>
            <button class="primary" type="submit" :disabled="busy">{{ t('portal.submitCode') }}</button>
          </form>
          <button type="button" @click="cancelBind">{{ t('portal.cancelBind') }}</button>
        </div>
      </section>
    </main>

    <ConfirmModal
      :body="t('portal.unbindConfirmBody')"
      :open="accountToUnbind !== null"
      :title="t('portal.unbindConfirmTitle')"
      @cancel="accountToUnbind = null"
      @confirm="confirmUnbind"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  cancelMyWechatBind,
  getMyWechatBinding,
  startMyWechatBind,
  submitMyWechatLoginCode,
  unbindMyWechatAccount,
  type MyWechatAccount,
  type MyWechatBinding,
} from '../api/admin-api';
import { signOut, useAuth } from '../auth';
import BrandLogo from '../components/BrandLogo.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { useI18n } from '../i18n';

const { t, toggleLanguage } = useI18n();
const { currentUser } = useAuth();
const router = useRouter();
const accountToUnbind = ref<MyWechatAccount | null>(null);
const binding = ref<MyWechatBinding | null>(null);
const busy = ref(false);
const codeInput = ref('');
const loginStatus = ref('idle');
const notice = ref('');
const noticeDanger = ref(false);
const qrDataUrl = ref<string | null>(null);
const qrUrl = ref<string | null>(null);
const qrVisible = ref(false);
let pollTimer: number | null = null;

onMounted(() => {
  void loadBinding();
});

onBeforeUnmount(() => {
  stopPolling();
});

async function loadBinding(): Promise<void> {
  try {
    binding.value = await getMyWechatBinding();
  } catch (error) {
    showError(error);
  }
}

async function startBind(): Promise<void> {
  busy.value = true;
  notice.value = '';

  try {
    const state = await startMyWechatBind();

    qrDataUrl.value = state.qrcodeDataUrl ?? null;
    qrUrl.value = state.qrcodeUrl ?? null;
    loginStatus.value = state.status;
    qrVisible.value = state.qrcodeDataUrl !== undefined || state.qrcodeUrl !== undefined;
    startPolling();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

function startPolling(): void {
  stopPolling();
  pollTimer = window.setInterval(() => {
    void refreshBindStatus();
  }, 3000);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function refreshBindStatus(): Promise<void> {
  try {
    const next = await getMyWechatBinding();

    binding.value = next;
    loginStatus.value = next.login.status;
    qrDataUrl.value = next.login.qrcodeDataUrl ?? null;
    qrUrl.value = next.login.qrcodeUrl ?? null;

    if (next.login.status === 'connected' || next.accounts.length > 0) {
      qrVisible.value = false;
      stopPolling();
      noticeDanger.value = false;
      notice.value = t('portal.bindSuccess');

      if (next.accounts.length === 0) {
        await loadBinding();
      }
    }
  } catch (error) {
    showError(error);
  }
}

async function submitCode(): Promise<void> {
  busy.value = true;

  try {
    await submitMyWechatLoginCode(codeInput.value.trim());
    codeInput.value = '';
    await refreshBindStatus();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

function cancelBind(): void {
  qrVisible.value = false;
  stopPolling();
  void cancelMyWechatBind().catch(() => undefined);
}

async function confirmUnbind(): Promise<void> {
  const account = accountToUnbind.value;

  accountToUnbind.value = null;

  if (account === null) {
    return;
  }

  busy.value = true;
  notice.value = '';

  try {
    await unbindMyWechatAccount(account.accountId);
    noticeDanger.value = false;
    notice.value = t('portal.unbindSuccess');
    await loadBinding();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function handleLogout(): Promise<void> {
  await signOut();
  await router.push('/login');
}

function showError(error: unknown): void {
  noticeDanger.value = true;
  notice.value = error instanceof Error ? error.message : String(error);
}
</script>
