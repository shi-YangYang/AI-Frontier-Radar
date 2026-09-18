<template>
  <div class="portal-shell">
    <header class="portal-header">
      <div class="portal-header-inner">
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
          <div class="portal-header-buttons">
            <button class="language-button" type="button" @click="toggleLanguage">
              {{ t('language.switchTo') }}
            </button>
            <button type="button" @click="handleLogout">{{ t('auth.logout') }}</button>
          </div>
        </div>
      </div>
    </header>

    <main class="portal-content">
      <ToastNotice :message="notice" :danger="noticeDanger" />

      <section class="panel">
        <header class="panel-header portal-panel-header">
          <div class="portal-panel-text">
            <h2>{{ t('portal.wechatTitle') }}</h2>
            <p>{{ t('portal.wechatDescription') }}</p>
          </div>
          <button
            class="primary"
            type="button"
            :disabled="busy || qrVisible || hasBinding"
            @click="startBind"
          >
            {{ t('portal.bindAction') }}
          </button>
        </header>
        <p v-if="hasBinding" class="portal-binding-hint muted">{{ t('portal.oneBindingHint') }}</p>

        <div v-if="binding === null" class="empty-panel">{{ t('portal.loading') }}</div>

        <div v-else-if="binding.accounts.length === 0 && !qrVisible" class="portal-empty">
          <div class="portal-empty-icon" aria-hidden="true">◎</div>
          <p>{{ t('portal.noBindings') }}</p>
          <small>{{ t('portal.emptyHint') }}</small>
        </div>

        <div v-else class="portal-account-list">
          <article v-for="account in binding.accounts" :key="account.accountId" class="portal-account">
            <div class="portal-account-main">
              <strong class="portal-account-name">{{ t('portal.boundWechat') }}</strong>
              <small class="muted portal-account-id" :title="account.accountId">
                {{ t('portal.accountId') }}：{{ account.accountId }}
              </small>
            </div>
            <div class="portal-account-actions">
              <span class="status-badge" :class="account.enabled ? 'good' : 'neutral'">
                {{ account.enabled ? t('portal.pushOn') : t('portal.pushOff') }}
              </span>
              <button class="danger" type="button" :disabled="busy" @click="accountToUnbind = account">
                {{ t('portal.unbindAction') }}
              </button>
            </div>

            <div class="portal-account-sources">
              <div class="portal-sources-head">
                <span class="portal-sources-label">{{ t('portal.sourcesLabel') }}</span>
                <span class="muted">
                  {{
                    account.sourceIds.length === 0
                      ? t('portal.sourcesAll')
                      : t('portal.sourcesSelected', { count: account.sourceIds.length })
                  }}
                </span>
                <button
                  class="portal-sources-toggle"
                  type="button"
                  @click="toggleSourcesEditor(account)"
                >
                  {{ editingAccountId === account.accountId ? t('portal.sourcesCancel') : t('portal.sourcesEdit') }}
                </button>
              </div>

              <div v-if="editingAccountId === account.accountId" class="portal-sources-editor">
                <div class="portal-source-modes">
                  <label class="portal-source-mode">
                    <input v-model="draftSourceMode" type="radio" value="all" />
                    <span>{{ t('portal.sourcesModeAll') }}</span>
                  </label>
                  <label class="portal-source-mode">
                    <input v-model="draftSourceMode" type="radio" value="selected" />
                    <span>{{ t('portal.sourcesModeSelected') }}</span>
                  </label>
                  <button
                    v-if="draftSourceMode === 'selected'"
                    class="portal-sources-inline"
                    type="button"
                    @click="selectAllSources"
                  >
                    {{ t('portal.sourcesSelectAll') }}
                  </button>
                  <button
                    v-if="draftSourceMode === 'selected'"
                    class="portal-sources-inline"
                    type="button"
                    @click="draftSourceIds = []"
                  >
                    {{ t('portal.sourcesClear') }}
                  </button>
                </div>

                <div v-if="draftSourceMode === 'selected'" class="portal-source-options">
                  <p v-if="binding.sources.length === 0" class="muted">{{ t('portal.sourcesEmpty') }}</p>
                  <section v-for="group in groupedSources" :key="group.key" class="portal-source-group">
                    <p class="portal-source-group-title">{{ t(group.labelKey) }}</p>
                    <div class="portal-source-group-grid">
                      <label v-for="source in group.sources" :key="source.id" class="portal-source-option">
                        <input v-model="draftSourceIds" type="checkbox" :value="source.id" />
                        <span>{{ sourceLabel(source) }}</span>
                      </label>
                    </div>
                  </section>
                </div>

                <p class="portal-sources-hint muted">{{ t('portal.sourcesHint') }}</p>
                <div class="portal-sources-actions">
                  <button class="primary" type="button" :disabled="busy" @click="saveSources(account.accountId)">
                    {{ t('portal.sourcesSave') }}
                  </button>
                  <button type="button" @click="editingAccountId = null">{{ t('portal.sourcesCancel') }}</button>
                </div>
              </div>
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  cancelMyWechatBind,
  getMyWechatBinding,
  startMyWechatBind,
  submitMyWechatLoginCode,
  unbindMyWechatAccount,
  updateMyWechatSources,
  type MyWechatAccount,
  type MyWechatBinding,
  type MyWechatSource,
} from '../api/admin-api';
import { signOut, useAuth } from '../auth';
import {
  SOURCE_GROUP_LABEL_KEYS,
  SOURCE_GROUP_ORDER,
  sourceGroup,
  sourceLabel,
  type SourceGroupKey,
} from '../source-labels';
import BrandLogo from '../components/BrandLogo.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { useI18n } from '../i18n';

const { t, toggleLanguage } = useI18n();
const { currentUser } = useAuth();
const router = useRouter();
const accountToUnbind = ref<MyWechatAccount | null>(null);
const hasBinding = computed(() => (binding.value?.accounts.length ?? 0) > 0);
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
const binding = ref<MyWechatBinding | null>(null);
const busy = ref(false);
const codeInput = ref('');
const draftSourceIds = ref<string[]>([]);
const draftSourceMode = ref<'all' | 'selected'>('all');
const editingAccountId = ref<string | null>(null);
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

function toggleSourcesEditor(account: MyWechatAccount): void {
  if (editingAccountId.value === account.accountId) {
    editingAccountId.value = null;

    return;
  }

  editingAccountId.value = account.accountId;
  draftSourceMode.value = account.sourceIds.length === 0 ? 'all' : 'selected';
  draftSourceIds.value = [...account.sourceIds];
}

function selectAllSources(): void {
  draftSourceIds.value = binding.value?.sources.map((source) => source.id) ?? [];
}

async function saveSources(accountId: string): Promise<void> {
  const sourceIds = draftSourceMode.value === 'all' ? [] : draftSourceIds.value;

  if (draftSourceMode.value === 'selected' && sourceIds.length === 0) {
    showError(t('portal.sourcesNeedOne'));

    return;
  }

  busy.value = true;
  notice.value = '';

  try {
    await updateMyWechatSources(accountId, sourceIds);
    editingAccountId.value = null;
    noticeDanger.value = false;
    notice.value = t('portal.sourcesSaved');
    await loadBinding();
  } catch (error) {
    showError(error);
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

async function handleLogout(): Promise<void> {
  await signOut();
  await router.push('/login');
}

function showError(error: unknown): void {
  noticeDanger.value = true;
  notice.value = error instanceof Error ? error.message : String(error);
}
</script>
