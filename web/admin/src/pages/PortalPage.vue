<template>
  <div class="me-shell">
    <header class="me-hero">
      <div class="me-hero-inner">
        <div class="me-hero-row">
          <span class="me-avatar">
            <BrandLogo :alt="t('brand.name')" />
          </span>
          <div class="me-hero-text">
            <strong>{{ t('brand.name') }}</strong>
            <small>{{ t('brand.subtitle') }}</small>
          </div>
          <div class="me-hero-actions">
            <span class="me-user-name">{{ t('portal.greeting', { username: currentUser?.nickname ?? currentUser?.username ?? '' }) }}</span>
            <button class="me-ghost-button" type="button" @click="toggleLanguage">
              {{ t('language.switchTo') }}
            </button>
            <button class="me-ghost-button" type="button" @click="handleLogout">
              {{ t('auth.logout') }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <nav class="me-tabs" :aria-label="t('nav.breadcrumb')">
      <div class="me-tabs-inner" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="me-tab"
          :class="{ active: activeTab === tab.key }"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          @click="switchTab(tab.key)"
        >
          {{ t(tab.labelKey) }}
        </button>
      </div>
    </nav>

    <main class="me-content" :class="{ 'me-content-wide': activeTab === 'messages' }">
      <header class="me-page-heading">
        <h1>{{ t(activeTab === 'wechat' ? 'me.nav.wechat' : 'me.nav.messages') }}</h1>
        <p>{{ t(activeTab === 'wechat' ? 'portal.tagline' : 'me.posts.description') }}</p>
      </header>
      <ToastNotice :message="notice" :danger="noticeDanger" />

      <div v-if="activeTab === 'wechat'" class="me-wechat-layout" :class="{ 'is-bound': hasBinding }">
        <section class="me-card me-connection-card">
          <header class="me-card-head">
            <div class="me-card-title">
              <span class="me-card-icon me-card-icon-wechat" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8.5 4.5c-3.6 0-6.5 2.4-6.5 5.4 0 1.7.9 3.2 2.4 4.2l-.6 2 2.3-1.2c.8.2 1.6.3 2.4.3" />
                  <path d="M15 9.5c-3.3 0-6 2.2-6 5s2.7 5 6 5c.7 0 1.4-.1 2-.3l2.1 1.1-.5-1.8c1.4-1 2.4-2.4 2.4-4 0-2.8-2.7-5-6-5z" />
                </svg>
              </span>
              <div>
                <h2>{{ t('portal.wechatTitle') }}</h2>
                <p>{{ t('portal.wechatDescription') }}</p>
              </div>
            </div>
            <span v-if="binding !== null" class="me-chip-status" :class="hasBinding ? 'ok' : 'muted'">
              {{ hasBinding ? t('portal.connected') : t('portal.notConnected') }}
            </span>
          </header>

          <div v-if="binding === null" class="me-empty" role="status">
            <p>{{ t(bindingLoading ? 'portal.loading' : 'portal.loadFailed') }}</p>
            <button v-if="!bindingLoading" type="button" @click="loadBinding">{{ t('actions.refresh') }}</button>
          </div>

          <div v-else-if="!hasBinding" class="me-bind">
            <p class="me-bind-intro">{{ t('portal.emptyHint') }}</p>
            <ol class="me-bind-steps">
              <li>{{ t('me.bind.step1') }}</li>
              <li>{{ t('me.bind.step2') }}</li>
            </ol>
            <button class="me-primary" type="button" :disabled="busy || qrVisible" @click="startBind">
              {{ t('portal.bindAction') }}
            </button>
          </div>

          <template v-else>
            <div class="me-account">
              <div class="me-account-main">
                <span class="me-account-label">{{ t('portal.boundWechat') }}</span>
                <code class="me-account-id" :title="boundAccount?.accountId">{{ boundAccount?.accountId }}</code>
              </div>
              <button class="me-link-button" type="button" :disabled="busy" @click="accountToUnbind = boundAccount">
                {{ t('portal.unbindAction') }}
              </button>
            </div>

            <div class="me-status" :class="sessionActive ? 'ok' : 'warn'">
              <span class="me-status-dot" aria-hidden="true"></span>
              <span>{{ sessionStateLabel }}</span>
            </div>

            <div class="me-quota">
              <div class="me-quota-head">
                <span class="me-quota-label">{{ t('me.quota.title') }}</span>
                <span class="me-quota-value" :class="{ full: quotaFull }">
                  <b>{{ quotaCount }}</b><i>/{{ quotaLimit }}</i>
                </span>
              </div>
              <div class="me-quota-bar">
                <span class="me-quota-fill" :class="{ full: quotaFull }" :style="{ width: quotaPercent }"></span>
              </div>
              <p class="me-quota-hint">{{ quotaFull ? t('me.quota.full') : t('me.quota.resetHint') }}</p>
            </div>
          </template>

          <div v-if="qrVisible" class="me-qr">
            <p class="me-qr-hint">{{ t('portal.scanHint') }}</p>
            <img v-if="qrDataUrl !== null" :src="qrDataUrl" alt="WeChat login QR" class="wechat-qr-image" />
            <a v-if="qrUrl !== null" :href="qrUrl" rel="noreferrer" target="_blank">{{ t('portal.openQrLink') }}</a>
            <p class="me-bind-hint">{{ t('me.bind.hintAfterScan') }}</p>
            <form v-if="loginStatus === 'need-code'" class="me-code-form" @submit.prevent="submitCode">
              <label>
                <span>{{ t('portal.codeLabel') }}</span>
                <input v-model="codeInput" autocomplete="off" :placeholder="t('portal.codePlaceholder')" />
              </label>
              <button class="me-primary" type="submit" :disabled="busy">{{ t('portal.submitCode') }}</button>
            </form>
            <button class="me-ghost-button" type="button" @click="cancelBind">{{ t('portal.cancelBind') }}</button>
          </div>
        </section>

        <section v-if="hasBinding" class="me-card me-settings-card">
          <header class="me-card-head">
            <div class="me-card-title">
              <span class="me-card-icon me-card-icon-settings" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </span>
              <div>
                <h2>{{ t('portal.settingsTitle') }}</h2>
                <p>{{ t('portal.settingsDescription') }}</p>
              </div>
            </div>
          </header>

          <div class="me-settings-group">
            <p class="me-settings-group-head">
              <span class="me-card-icon me-card-icon-quiet" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
                </svg>
              </span>
              <span class="me-settings-group-text">
                <strong>{{ t('portal.quietTitle') }}</strong>
                <small>{{ t('portal.quietDescription') }}</small>
              </span>
            </p>
            <div class="me-row">
              <span class="me-settings-row-label">{{ t('portal.quietTitle') }}</span>
              <button
                class="me-switch"
                :class="{ on: quietEnabled }"
                type="button"
                role="switch"
                :aria-checked="quietEnabled"
                :aria-label="t('portal.quietTitle')"
                :disabled="busy"
                @click="toggleQuietHours"
              >
                <span class="me-switch-knob"></span>
              </button>
            </div>

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
              <span class="me-save-state">{{ saveStateLabel }}</span>
            </div>
          </div>

          <div class="me-settings-group">
            <p class="me-settings-group-head">
              <span class="me-card-icon me-card-icon-source" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h10" />
                </svg>
              </span>
              <span class="me-settings-group-text">
                <strong>{{ t('portal.sourcesLabel') }}</strong>
                <small>{{ t('portal.sourcesHint') }}</small>
              </span>
            </p>
            <div class="me-row">
              <div
                class="me-segmented"
                role="radiogroup"
                :aria-label="t('portal.sourcesLabel')"
              >
                <button
                  class="me-segment"
                  :class="{ on: sourcesAll }"
                  type="button"
                  role="radio"
                  :aria-checked="sourcesAll"
                  :disabled="busy"
                  @click="selectSourcesMode(true)"
                >
                  {{ t('portal.sourcesModeReceiveAll') }}
                </button>
                <button
                  class="me-segment"
                  :class="{ on: !sourcesAll }"
                  type="button"
                  role="radio"
                  :aria-checked="!sourcesAll"
                  :disabled="busy"
                  @click="selectSourcesMode(false)"
                >
                  {{ t('portal.sourcesModeReceiveCustom') }}
                </button>
              </div>
            </div>

            <p class="me-inline-state">
              {{ sourcesAll ? t('portal.sourcesModeAll') : t('portal.sourcesSelected', { count: selectedSourceIds.length }) }}
              <template v-if="saveStateLabel.length > 0"> · {{ saveStateLabel }}</template>
            </p>

            <div v-if="!sourcesAll" class="me-source-groups">
              <p v-if="groupedSources.length === 0" class="me-inline-state">{{ t('portal.sourcesEmpty') }}</p>
              <section v-for="group in groupedSources" :key="group.key" class="me-source-group">
                <p class="me-source-group-title">{{ t(group.labelKey) }}</p>
                <div class="me-source-chips">
                  <button
                    v-for="source in group.sources"
                    :key="source.id"
                    class="me-source-chip"
                    :class="{ on: selectedSourceIds.includes(source.id) }"
                    :aria-pressed="selectedSourceIds.includes(source.id)"
                    type="button"
                    :disabled="busy"
                    @click="toggleSource(source.id)"
                  >
                    {{ sourceLabel(source) }}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>

      <template v-else>
        <section class="me-card me-messages-card">
          <header class="me-card-head">
            <h2 class="me-message-count">{{ t('me.posts.total', { total: postsPagination.total }) }}</h2>
            <button class="me-ghost-button" type="button" :disabled="postsLoading" @click="loadPosts(1)">
              {{ t('actions.refresh') }}
            </button>
          </header>

          <form class="me-search" @submit.prevent="applySearch">
            <span class="me-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              v-model="searchInput"
              autocomplete="off"
              :placeholder="t('me.posts.searchPlaceholder')"
              :aria-label="t('me.posts.searchPlaceholder')"
            />
            <button v-if="activeQuery.length > 0" class="me-search-clear" type="button" @click="clearSearch">
              {{ t('me.posts.searchClear') }}
            </button>
            <button class="me-search-submit" type="submit" :disabled="postsLoading">
              {{ t('me.posts.searchAction') }}
            </button>
          </form>

          <div v-if="posts.length === 0" class="me-empty me-messages-empty" role="status">
            <svg class="me-empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <rect x="7" y="10" width="34" height="28" rx="5" />
              <path d="m8 14 16 12 16-12" />
            </svg>
            <p>{{ t(postsLoading ? 'me.posts.loading' : postsFailed ? 'me.posts.loadFailed' : activeQuery.length > 0 ? 'me.posts.noResults' : 'me.posts.empty') }}</p>
          </div>

          <div v-else class="me-post-list">
            <article v-for="post in posts" :key="post.id" class="me-post">
              <header class="me-post-head">
                <span class="me-post-source">{{ post.sourceDisplayName ?? post.authorUsername }}</span>
                <time class="me-post-time" :datetime="post.postedAt" :title="formatDateTime(post.postedAt)">
                  {{ formatPostTime(post.postedAt) }}
                </time>
              </header>
              <h3 v-if="post.title" class="me-post-title">{{ post.title }}</h3>
              <p v-if="post.textContent.trim().length > 0" class="me-post-body" :class="{ clamped: isLongPost(post) && !expandedPostIds.has(post.id) }">
                {{ post.textContent }}
              </p>
              <p v-else class="me-post-body me-post-body-empty">{{ t('me.posts.noBody') }}</p>
              <div class="me-post-foot">
                <a class="me-post-link" :href="post.permalinkUrl" rel="noreferrer" target="_blank">
                  {{ t('me.posts.openOriginal') }}
                </a>
                <button
                  v-if="isLongPost(post)"
                  class="me-post-expand"
                  type="button"
                  :aria-expanded="expandedPostIds.has(post.id)"
                  @click="togglePostExpanded(post.id)"
                >
                  {{ expandedPostIds.has(post.id) ? t('me.posts.collapse') : t('me.posts.expand') }}
                </button>
              </div>
            </article>
          </div>

          <nav v-if="posts.length > 0 && postsPagination.totalPages > 1" class="me-pagination" :aria-label="t('me.posts.paginationLabel')">
            <button
              class="me-pagination-nav"
              type="button"
              :disabled="postsLoading || postsPagination.page <= 1"
              :aria-label="t('actions.previousPage')"
              @click="goToPage(postsPagination.page - 1)"
            >
              ‹
            </button>
            <template v-for="item in paginationItems" :key="item.type === 'ellipsis' ? `ellipsis-${item.key}` : `page-${item.key}`">
              <span v-if="item.type === 'ellipsis'" class="me-pagination-ellipsis" aria-hidden="true">…</span>
              <button
                v-else
                class="me-pagination-page"
                :class="{ current: item.page === postsPagination.page }"
                type="button"
                :disabled="postsLoading"
                :aria-current="item.page === postsPagination.page ? 'page' : undefined"
                :aria-label="t('me.posts.pageLabel', { page: item.page })"
                @click="goToPage(item.page)"
              >
                {{ item.page }}
              </button>
            </template>
            <button
              class="me-pagination-nav"
              type="button"
              :disabled="postsLoading || postsPagination.page >= postsPagination.totalPages"
              :aria-label="t('actions.nextPage')"
              @click="goToPage(postsPagination.page + 1)"
            >
              ›
            </button>
          </nav>
        </section>
      </template>
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
  listMyPosts,
  startMyWechatBind,
  submitMyWechatLoginCode,
  unbindMyWechatAccount,
  updateMyWechatQuietHours,
  updateMyWechatSources,
  type MyWechatAccount,
  type MyWechatBinding,
  type MyWechatSource,
  type UserPostItem,
} from '../api/admin-api';
import { signOut, useAuth } from '../auth';
import BrandLogo from '../components/BrandLogo.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { tBackend, useI18n, type MessageKey } from '../i18n';
import {
  SOURCE_GROUP_LABEL_KEYS,
  SOURCE_GROUP_ORDER,
  sourceGroup,
  sourceLabel,
  type SourceGroupKey,
} from '../source-labels';
import { formatDateTime } from '../utils';

type PortalTabKey = 'messages' | 'wechat';

const { t, toggleLanguage } = useI18n();
const { currentUser } = useAuth();
const router = useRouter();
const accountToUnbind = ref<MyWechatAccount | null>(null);
const activeTab = ref<PortalTabKey>('wechat');
const binding = ref<MyWechatBinding | null>(null);
const bindingLoading = ref(true);
const busy = ref(false);
const codeInput = ref('');
const loginStatus = ref('idle');
const notice = ref('');
const noticeDanger = ref(false);
const posts = ref<UserPostItem[]>([]);
const postsLoading = ref(false);
const postsFailed = ref(false);
const postsPagination = ref({ page: 1, pageSize: 18, total: 0, totalPages: 0 });
const qrDataUrl = ref<string | null>(null);
const qrUrl = ref<string | null>(null);
const qrVisible = ref(false);
const quietEnabled = ref(false);
const quietEndHour = ref(8);
const quietStartHour = ref(23);
const saveState = ref<'idle' | 'saving' | 'saved'>('idle');
const expandedPostIds = ref(new Set<string>());
const activeQuery = ref('');
const searchInput = ref('');
const selectedSourceIds = ref<string[]>([]);
const sourcesAll = ref(true);
let pollTimer: number | null = null;
let saveStateTimer: number | null = null;

const tabs: Array<{ key: PortalTabKey; labelKey: MessageKey }> = [
  { key: 'wechat', labelKey: 'me.nav.wechat' },
  { key: 'messages', labelKey: 'me.nav.messages' },
];
const hourOptions = Array.from({ length: 24 }, (_, index) => index);
const hasBinding = computed(() => (binding.value?.accounts.length ?? 0) > 0);
const boundAccount = computed<MyWechatAccount | null>(() => binding.value?.accounts[0] ?? null);
const quotaLimit = computed(() => boundAccount.value?.sendLimit ?? 10);
const quotaCount = computed(() => Math.min(boundAccount.value?.sendCount ?? 0, quotaLimit.value));
const quotaFull = computed(() => quotaCount.value >= quotaLimit.value);
const quotaPercent = computed(() =>
  quotaLimit.value === 0 ? '0%' : `${Math.min(100, Math.round((quotaCount.value / quotaLimit.value) * 100))}%`,
);
const sessionActive = computed(() => boundAccount.value?.sessionActive === true);
const sessionStateLabel = computed(() =>
  sessionActive.value
    ? t('me.session.active')
    : binding.value === null
      ? t('me.session.checking')
      : t('me.session.inactive'),
);
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
type PaginationItem = { type: 'page'; page: number; key: number } | { type: 'ellipsis'; key: number };
const paginationItems = computed<PaginationItem[]>(() => {
  const totalPages = postsPagination.value.totalPages;
  const current = postsPagination.value.page;

  if (totalPages <= 1) {
    return [];
  }

  const pages = new Set<number>([1, totalPages, current - 1, current, current + 1]);
  const items: PaginationItem[] = [];
  let previous = 0;

  for (const page of [...pages].filter((value) => value >= 1 && value <= totalPages).sort((left, right) => left - right)) {
    if (previous > 0 && page - previous > 1) {
      items.push({ type: 'ellipsis', key: previous });
    }

    items.push({ type: 'page', page, key: page });
    previous = page;
  }

  return items;
});

onMounted(() => {
  void loadBinding();
  void loadPosts(1);
});

onBeforeUnmount(() => {
  stopPolling();
  stopSaveStateTimer();
});

function switchTab(tab: PortalTabKey): void {
  activeTab.value = tab;
}

async function loadBinding(): Promise<void> {
  bindingLoading.value = true;

  try {
    binding.value = await getMyWechatBinding();
    syncBindingState();
  } catch (error) {
    showError(error);
  } finally {
    bindingLoading.value = false;
  }
}

function syncBindingState(): void {
  const account = boundAccount.value;

  selectedSourceIds.value = account?.sourceIds ?? [];
  sourcesAll.value = selectedSourceIds.value.length === 0;
  quietEnabled.value = account?.quietHours?.enabled === true;
  quietStartHour.value = account?.quietHours?.startHour ?? 23;
  quietEndHour.value = account?.quietHours?.endHour ?? 8;
}

async function loadPosts(page: number): Promise<void> {
  postsLoading.value = true;
  postsFailed.value = false;

  try {
    const result = await listMyPosts(page, postsPagination.value.pageSize, activeQuery.value);

    posts.value = result.posts;
    postsPagination.value = result.pagination;
  } catch (error) {
    postsFailed.value = true;
    showError(error);
  } finally {
    postsLoading.value = false;
  }
}

function applySearch(): void {
  activeQuery.value = searchInput.value.trim();
  expandedPostIds.value = new Set();
  void loadPosts(1);
}

async function goToPage(page: number): Promise<void> {
  if (page < 1 || page > postsPagination.value.totalPages || page === postsPagination.value.page) {
    return;
  }

  expandedPostIds.value = new Set();
  await loadPosts(page);
}

function clearSearch(): void {
  searchInput.value = '';
  activeQuery.value = '';
  expandedPostIds.value = new Set();
  void loadPosts(1);
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

    if (next.login.status === 'failed' || (qrVisible.value && next.login.status === 'idle' && next.accounts.length === 0)) {
      qrVisible.value = false;
      stopPolling();
      noticeDanger.value = true;
      notice.value = tBackend(next.login.message ?? t('portal.bindFailed'));
      return;
    }

    if (next.accounts.length > 0) {
      const active = next.accounts[0]?.sessionActive === true;

      if (active) {
        qrVisible.value = false;
        stopPolling();
        noticeDanger.value = false;
        notice.value = t('portal.bindSuccess');
      } else if (qrVisible.value) {
        noticeDanger.value = false;
        notice.value = t('me.bind.waitingMessage');
      }

      syncBindingState();
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
    sourcesAll.value = false;

    return;
  }

  sourcesAll.value = true;
  selectedSourceIds.value = [];
  await saveSources();
}

async function selectSourcesMode(nextAll: boolean): Promise<void> {
  if (nextAll === sourcesAll.value) {
    return;
  }

  await toggleSourcesMode();
}

async function toggleSource(sourceId: string): Promise<void> {
  if (selectedSourceIds.value.includes(sourceId)) {
    selectedSourceIds.value = selectedSourceIds.value.filter((id) => id !== sourceId);
  } else {
    selectedSourceIds.value = [...selectedSourceIds.value, sourceId];
  }

  if (selectedSourceIds.value.length === 0) {
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

function formatPostTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (input: number) => String(input).padStart(2, '0');

  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isLongPost(post: UserPostItem): boolean {
  return post.textContent.length > 140 || post.textContent.split('\n').length > 4;
}

function togglePostExpanded(postId: string): void {
  const next = new Set(expandedPostIds.value);

  if (next.has(postId)) {
    next.delete(postId);
  } else {
    next.add(postId);
  }

  expandedPostIds.value = next;
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
