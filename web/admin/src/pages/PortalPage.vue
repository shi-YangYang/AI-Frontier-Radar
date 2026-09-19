<template>
  <div class="me-shell">
    <header class="me-hero">
      <div class="me-hero-inner">
        <div class="me-hero-top">
          <div class="me-brand">
            <BrandLogo :alt="t('brand.name')" class="me-logo" />
            <div>
              <strong>{{ t('brand.name') }}</strong>
              <small>{{ t('portal.subtitle') }}</small>
            </div>
          </div>
          <div class="me-hero-actions">
            <button class="language-button" type="button" @click="toggleLanguage">
              {{ t('language.switchTo') }}
            </button>
            <button type="button" @click="handleLogout">{{ t('auth.logout') }}</button>
          </div>
        </div>
        <h1>{{ t('portal.greeting', { username: currentUser?.username ?? '' }) }}</h1>
        <p>{{ t('portal.tagline') }}</p>
      </div>
    </header>

    <main class="me-content">
      <ToastNotice :message="notice" :danger="noticeDanger" />

      <section class="me-card">
        <header class="me-card-head">
          <div>
            <h2>{{ t('portal.wechatTitle') }}</h2>
            <p>{{ t('portal.wechatDescription') }}</p>
          </div>
          <span v-if="binding !== null" class="status-badge" :class="hasBinding ? 'good' : 'neutral'">
            {{ hasBinding ? t('portal.connected') : t('portal.notConnected') }}
          </span>
        </header>

        <div v-if="binding === null" class="me-empty">{{ t('portal.loading') }}</div>

        <div v-else-if="!hasBinding" class="me-bind">
          <p class="me-muted">{{ t('portal.noBindings') }}</p>
          <button class="primary" type="button" :disabled="busy || qrVisible" @click="startBind">
            {{ t('portal.bindAction') }}
          </button>
        </div>

        <div v-else class="me-account">
          <div class="me-account-main">
            <strong>{{ t('portal.boundWechat') }}</strong>
            <small class="me-muted" :title="boundAccount?.accountId">
              {{ t('portal.accountId') }}：{{ boundAccount?.accountId }}
            </small>
          </div>
          <button
            class="danger"
            type="button"
            :disabled="busy"
            @click="accountToUnbind = boundAccount"
          >
            {{ t('portal.unbindAction') }}
          </button>
        </div>

        <p v-if="hasBinding && boundAccount?.sessionActive === false" class="me-session-warning">
          {{ t('portal.sessionInactive') }}
        </p>

        <div v-if="qrVisible" class="me-qr">
          <p class="me-muted">{{ t('portal.scanHint') }}</p>
          <img v-if="qrDataUrl !== null" :src="qrDataUrl" alt="WeChat login QR" class="wechat-qr-image" />
          <a v-if="qrUrl !== null" :href="qrUrl" rel="noreferrer" target="_blank">{{ t('portal.openQrLink') }}</a>
          <form v-if="loginStatus === 'need-code'" class="me-code-form" @submit.prevent="submitCode">
            <input v-model="codeInput" autocomplete="off" :placeholder="t('portal.codePlaceholder')" />
            <button class="primary" type="submit" :disabled="busy">{{ t('portal.submitCode') }}</button>
          </form>
          <button type="button" @click="cancelBind">{{ t('portal.cancelBind') }}</button>
        </div>
      </section>

      <section v-if="hasBinding" class="me-card">
        <header class="me-card-head">
          <div>
            <h2>{{ t('portal.quietTitle') }}</h2>
            <p>{{ t('portal.quietDescription') }}</p>
          </div>
          <button
            class="switch"
            :class="{ on: quietEnabled }"
            type="button"
            role="switch"
            :aria-checked="quietEnabled"
            :aria-label="t('portal.quietTitle')"
            :disabled="busy"
            @click="toggleQuietHours"
          >
            <span class="switch-knob"></span>
          </button>
        </header>

        <div v-if="quietEnabled" class="me-quiet-range">
          <label>
            <span>{{ t('portal.quietStart') }}</span>
            <select v-model.number="quietStartHour" :disabled="busy" @change="saveQuietHours()">
              <option v-for="hour in hourOptions" :key="`start-${hour}`" :value="hour">
                {{ formatHour(hour) }}
              </option>
            </select>
          </label>
          <span class="me-quiet-sep">→</span>
          <label>
            <span>{{ t('portal.quietEnd') }}</span>
            <select v-model.number="quietEndHour" :disabled="busy" @change="saveQuietHours()">
              <option v-for="hour in hourOptions" :key="`end-${hour}`" :value="hour">
                {{ formatHour(hour) }}
              </option>
            </select>
          </label>
          <span class="me-save-state me-muted">{{ saveStateLabel }}</span>
        </div>
      </section>

      <section v-if="hasBinding" class="me-card">
        <header class="me-card-head">
          <div>
            <h2>{{ t('portal.sourcesLabel') }}</h2>
            <p>{{ t('portal.sourcesHint') }}</p>
          </div>
          <button
            class="switch"
            :class="{ on: !sourcesAll }"
            type="button"
            role="switch"
            :aria-checked="!sourcesAll"
            :aria-label="t('portal.sourcesModeCustom')"
            :disabled="busy"
            @click="toggleSourcesMode"
          >
            <span class="switch-knob"></span>
          </button>
        </header>

        <p class="me-muted me-save-state">
          {{ sourcesAll ? t('portal.sourcesModeAll') : t('portal.sourcesSelected', { count: selectedSourceIds.length }) }}
          <template v-if="saveStateLabel.length > 0"> · {{ saveStateLabel }}</template>
        </p>

        <div v-if="!sourcesAll" class="me-source-groups">
          <section v-for="group in groupedSources" :key="group.key" class="me-source-group">
            <p class="me-source-group-title">{{ t(group.labelKey) }}</p>
            <div class="me-chips">
              <button
                v-for="source in group.sources"
                :key="source.id"
                class="me-chip"
                :class="{ on: selectedSourceIds.includes(source.id) }"
                type="button"
                :disabled="busy"
                @click="toggleSource(source.id)"
              >
                {{ sourceLabel(source) }}
              </button>
            </div>
          </section>
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  cancelMyWechatBind,
  getMyWechatBinding,
  startMyWechatBind,
  submitMyWechatLoginCode,
  unbindMyWechatAccount,
  updateMyWechatQuietHours,
  updateMyWechatSources,
  type MyWechatAccount,
  type MyWechatBinding,
  type MyWechatSource,
} from '../api/admin-api';
import { signOut, useAuth } from '../auth';
import BrandLogo from '../components/BrandLogo.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { useI18n } from '../i18n';
import {
  SOURCE_GROUP_LABEL_KEYS,
  SOURCE_GROUP_ORDER,
  sourceGroup,
  sourceLabel,
  type SourceGroupKey,
} from '../source-labels';

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
const quietEnabled = ref(false);
const quietEndHour = ref(8);
const quietStartHour = ref(23);
const saveState = ref<'idle' | 'saving' | 'saved'>('idle');
const selectedSourceIds = ref<string[]>([]);
const sourcesAll = ref(true);
let pollTimer: number | null = null;
let saveStateTimer: number | null = null;

const hourOptions = Array.from({ length: 24 }, (_, index) => index);
const hasBinding = computed(() => (binding.value?.accounts.length ?? 0) > 0);
const boundAccount = computed<MyWechatAccount | null>(() => binding.value?.accounts[0] ?? null);
const saveStateLabel = computed(() =>
  saveState.value === 'saving'
    ? t('portal.saving')
    : saveState.value === 'saved'
      ? t('portal.saved')
      : '',
);
const groupedSources = computed(() => {
  const groups = new Map<SourceGroupKey, MyWechatSource[]>();

  for (const source of binding.value?.sources ?? []) {
    const key = sourceGroup(source);
    const list = groups.get(key) ?? [];

    list.push(source);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .sort(
      ([left], [right]) => SOURCE_GROUP_ORDER.indexOf(left) - SOURCE_GROUP_ORDER.indexOf(right),
    )
    .map(([key, sources]) => ({
      key,
      labelKey: SOURCE_GROUP_LABEL_KEYS[key],
      sources: [...sources].sort((left, right) =>
        sourceLabel(left).localeCompare(sourceLabel(right), 'zh-Hans-CN'),
      ),
    }));
});

onMounted(() => {
  void loadBinding();
});

onBeforeUnmount(() => {
  stopPolling();
  stopSaveStateTimer();
});

async function loadBinding(): Promise<void> {
  try {
    binding.value = await getMyWechatBinding();
    selectedSourceIds.value = boundAccount.value?.sourceIds ?? [];
    sourcesAll.value = selectedSourceIds.value.length === 0;
    quietEnabled.value = boundAccount.value?.quietHours?.enabled === true;
    quietStartHour.value = boundAccount.value?.quietHours?.startHour ?? 23;
    quietEndHour.value = boundAccount.value?.quietHours?.endHour ?? 8;
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
      } else {
        selectedSourceIds.value = next.accounts[0]?.sourceIds ?? [];
        sourcesAll.value = selectedSourceIds.value.length === 0;
        quietEnabled.value = next.accounts[0]?.quietHours?.enabled === true;
        quietStartHour.value = next.accounts[0]?.quietHours?.startHour ?? 23;
        quietEndHour.value = next.accounts[0]?.quietHours?.endHour ?? 8;
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

async function toggleQuietHours(): Promise<void> {
  quietEnabled.value = !quietEnabled.value;
  await saveQuietHours();
}

async function saveQuietHours(): Promise<void> {
  const account = boundAccount.value;

  if (account === null) {
    return;
  }

  busy.value = true;
  markSaving();

  try {
    const result = await updateMyWechatQuietHours(account.accountId, {
      enabled: quietEnabled.value,
      endHour: quietEndHour.value,
      startHour: quietStartHour.value,
    });

    quietEnabled.value = result?.enabled === true;
    quietStartHour.value = result?.startHour ?? quietStartHour.value;
    quietEndHour.value = result?.endHour ?? quietEndHour.value;
    markSaved();
  } catch (error) {
    showError(error);
    await loadBinding();
  } finally {
    busy.value = false;
  }
}

async function toggleSourcesMode(): Promise<void> {
  if (sourcesAll.value) {
    // 切换为「自选」：先本地进入编辑态，勾选任意源后再保存
    sourcesAll.value = false;

    return;
  }

  // 切回「全部源」：清空选择并立即保存
  sourcesAll.value = true;
  selectedSourceIds.value = [];
  await saveSources();
}

async function toggleSource(sourceId: string): Promise<void> {
  if (selectedSourceIds.value.includes(sourceId)) {
    selectedSourceIds.value = selectedSourceIds.value.filter((id) => id !== sourceId);
  } else {
    selectedSourceIds.value = [...selectedSourceIds.value, sourceId];
  }

  if (selectedSourceIds.value.length === 0) {
    // 一个源都不选等于「全部源」，避免歧义
    sourcesAll.value = true;
    noticeDanger.value = false;
    notice.value = t('portal.sourcesAllRestored');
    await saveSources();

    return;
  }

  await saveSources();
}

async function saveSources(): Promise<void> {
  const account = boundAccount.value;

  if (account === null) {
    return;
  }

  busy.value = true;
  markSaving();

  try {
    const sourceIds = sourcesAll.value ? [] : selectedSourceIds.value;
    const saved = await updateMyWechatSources(account.accountId, sourceIds);

    selectedSourceIds.value = saved;
    sourcesAll.value = saved.length === 0;
    markSaved();
  } catch (error) {
    showError(error);
    await loadBinding();
  } finally {
    busy.value = false;
  }
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

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function markSaving(): void {
  stopSaveStateTimer();
  saveState.value = 'saving';
}

function markSaved(): void {
  saveState.value = 'saved';
  stopSaveStateTimer();
  saveStateTimer = window.setTimeout(() => {
    saveState.value = 'idle';
  }, 2500);
}

function stopSaveStateTimer(): void {
  if (saveStateTimer !== null) {
    window.clearTimeout(saveStateTimer);
    saveStateTimer = null;
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
