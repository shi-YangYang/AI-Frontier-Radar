<template>
  <section>
    <PageHeader :title="t('posts.title')" :subtitle="t('posts.subtitle')">
      <div class="toolbar">
        <button type="button" :disabled="busy" @click="manualRefresh">{{ t('actions.refresh') }}</button>
        <button
          type="button"
          :class="{ primary: autoRefreshEnabled }"
          :aria-pressed="autoRefreshEnabled"
          @click="toggleAutoRefresh"
        >
          {{ autoRefreshEnabled ? t('posts.autoRefreshOn') : t('posts.autoRefreshOff') }}
        </button>
      </div>
    </PageHeader>

    <ToastNotice :message="notice" :danger="noticeDanger" />

    <div class="metric-grid">
      <article class="metric-card">
        <span>{{ t('posts.summary.total') }}</span>
        <strong>{{ summary.totalPosts }}</strong>
      </article>
      <article class="metric-card">
        <span>{{ t('posts.summary.today') }}</span>
        <strong>{{ summary.todayPosts }}</strong>
      </article>
      <article class="metric-card">
        <span>{{ t('posts.summary.latestDetectedAt') }}</span>
        <strong class="metric-date">{{ formatBeijingTime(summary.latestDetectedAt) }}</strong>
      </article>
      <article class="metric-card">
        <span>{{ t('posts.summary.autoRefresh') }}</span>
        <strong class="metric-date">{{ autoRefreshEnabled ? t('posts.enabled') : t('posts.disabled') }}</strong>
      </article>
    </div>

    <div class="panel posts-filter-panel">
      <button
        class="posts-filter-toggle"
        type="button"
        :aria-expanded="filtersExpanded"
        @click="filtersExpanded = !filtersExpanded"
      >
        {{ filtersExpanded ? t('posts.filters.hide') : t('posts.filters.show') }}
      </button>
      <form
        class="posts-filter-form"
        :class="{ expanded: filtersExpanded }"
        @submit.prevent="applyFilters"
      >
        <label>
          <span>{{ t('posts.filters.author') }}</span>
          <input v-model="filters.authorUsername" :placeholder="t('posts.filters.authorPlaceholder')" />
        </label>
        <label>
          <span>{{ t('posts.filters.query') }}</span>
          <input v-model="filters.query" :placeholder="t('posts.filters.queryPlaceholder')" />
        </label>
        <label>
          <span>{{ t('posts.filters.postedFrom') }}</span>
          <input v-model="filters.postedFrom" type="datetime-local" />
        </label>
        <label>
          <span>{{ t('posts.filters.postedTo') }}</span>
          <input v-model="filters.postedTo" type="datetime-local" />
        </label>
        <label>
          <span>{{ t('posts.filters.detectedFrom') }}</span>
          <input v-model="filters.detectedFrom" type="datetime-local" />
        </label>
        <label>
          <span>{{ t('posts.filters.detectedTo') }}</span>
          <input v-model="filters.detectedTo" type="datetime-local" />
        </label>
        <label>
          <span>{{ t('posts.filters.isReply') }}</span>
          <select v-model="filters.isReply">
            <option value="all">{{ t('posts.filters.all') }}</option>
            <option value="true">{{ t('posts.filters.onlyReplies') }}</option>
            <option value="false">{{ t('posts.filters.excludeReplies') }}</option>
          </select>
        </label>
        <label>
          <span>{{ t('posts.filters.isRepost') }}</span>
          <select v-model="filters.isRepost">
            <option value="all">{{ t('posts.filters.all') }}</option>
            <option value="true">{{ t('posts.filters.onlyReposts') }}</option>
            <option value="false">{{ t('posts.filters.excludeReposts') }}</option>
          </select>
        </label>
        <p class="posts-filter-hint">{{ t('posts.filters.replyRepostHint') }}</p>
        <div class="posts-filter-actions">
          <button class="primary" type="submit" :disabled="busy">{{ t('actions.query') }}</button>
          <button type="button" :disabled="busy" @click="clearFilters">{{ t('actions.clearQuery') }}</button>
          <button type="button" :disabled="busy" @click="manualRefresh">{{ t('posts.manualRefresh') }}</button>
        </div>
      </form>
    </div>

    <button
      v-if="pendingNewCount > 0"
      class="new-content-banner"
      type="button"
      @click="showNewContent"
    >
      {{ t('posts.newContent', { count: pendingNewCount }) }}
    </button>

    <div class="posts-timeline" aria-live="polite">
      <article v-if="posts.length === 0" class="panel posts-empty">
        <h2>{{ t('posts.emptyTitle') }}</h2>
        <p>{{ t('posts.emptyHint') }}</p>
      </article>

      <article
        v-for="post in posts"
        :key="post.id"
        class="post-card"
        tabindex="0"
        @click="openDetail(post)"
        @keydown.enter.prevent="openDetail(post)"
      >
        <div class="post-card-marker" aria-hidden="true"></div>
        <div class="post-card-body">
          <header class="post-card-header">
            <div class="post-author">
              <strong>@{{ post.authorUsername }}</strong>
              <span v-if="post.authorDisplayName">{{ post.authorDisplayName }}</span>
            </div>
            <div class="post-tags">
              <span v-if="post.isReply" class="status-badge neutral">{{ t('posts.tag.reply') }}</span>
              <span v-if="post.isRepost" class="status-badge neutral">{{ t('posts.tag.repost') }}</span>
            </div>
          </header>
          <p class="post-excerpt">{{ post.textContent }}</p>
          <dl class="post-meta-grid">
            <div>
              <dt>{{ t('posts.fields.beijingTime') }}</dt>
              <dd>{{ formatBeijingTime(post.postedAt) }}</dd>
            </div>
            <div>
              <dt>{{ t('posts.fields.utcTime') }}</dt>
              <dd>{{ formatUtcTime(post.postedAt) }}</dd>
            </div>
            <div>
              <dt>{{ t('posts.fields.detectedAt') }}</dt>
              <dd>{{ formatBeijingTime(post.detectedAt) }}</dd>
            </div>
            <div>
              <dt>{{ t('posts.fields.postId') }}</dt>
              <dd><code>{{ post.xPostId }}</code></dd>
            </div>
          </dl>
          <footer class="post-card-footer">
            <a
              class="button-link"
              :href="post.permalinkUrl"
              target="_blank"
              rel="noreferrer"
              @click.stop
            >
              {{ t('posts.openOriginal') }}
            </a>
            <div class="delivery-summary" :aria-label="t('posts.deliverySummary')">
              <span>{{ t('posts.delivery.total', { count: post.deliverySummary.total }) }}</span>
              <span>{{ t('posts.delivery.sent', { count: post.deliverySummary.sent }) }}</span>
              <span>{{ t('posts.delivery.active', { count: post.deliverySummary.active }) }}</span>
              <span>{{ t('posts.delivery.failed', { count: post.deliverySummary.failed }) }}</span>
              <span>{{ t('posts.delivery.dead', { count: post.deliverySummary.dead }) }}</span>
            </div>
          </footer>
        </div>
      </article>
    </div>

    <div class="panel">
      <PaginationBar
        :busy="busy"
        :pagination="pagination"
        @change-page="loadPage"
        @invalid-page="setNotice(t('notice.invalidPage'), true)"
      />
    </div>

    <div
      v-if="selectedPost !== null"
      class="post-drawer-backdrop"
      role="presentation"
      @click="closeDetail"
    >
      <aside
        class="post-drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="t('posts.detailTitle')"
        @click.stop
      >
        <header class="post-drawer-header">
          <div>
            <p>{{ t('posts.detailTitle') }}</p>
            <h2>@{{ selectedPost.authorUsername }}</h2>
          </div>
          <button class="icon-button" type="button" :aria-label="t('actions.close')" @click="closeDetail">
            ×
          </button>
        </header>

        <div class="post-drawer-content">
          <section class="post-detail-section">
            <h3>{{ t('posts.fullText') }}</h3>
            <p class="post-full-text">{{ selectedPost.textContent }}</p>
            <a class="button-link" :href="selectedPost.permalinkUrl" target="_blank" rel="noreferrer">
              {{ t('posts.openOriginal') }}
            </a>
          </section>

          <section class="post-detail-section">
            <h3>{{ t('posts.detailMeta') }}</h3>
            <dl class="detail-list post-detail-list">
              <div>
                <dt>{{ t('posts.fields.author') }}</dt>
                <dd>@{{ selectedPost.authorUsername }}</dd>
              </div>
              <div>
                <dt>{{ t('posts.fields.displayName') }}</dt>
                <dd>{{ dash(selectedPost.authorDisplayName) }}</dd>
              </div>
              <div>
                <dt>{{ t('posts.fields.postId') }}</dt>
                <dd><code>{{ selectedPost.xPostId }}</code></dd>
              </div>
              <div>
                <dt>{{ t('posts.fields.beijingTime') }}</dt>
                <dd>{{ formatBeijingTime(selectedPost.postedAt) }}</dd>
              </div>
              <div>
                <dt>{{ t('posts.fields.utcTime') }}</dt>
                <dd>{{ formatUtcTime(selectedPost.postedAt) }}</dd>
              </div>
              <div>
                <dt>{{ t('posts.fields.detectedAt') }}</dt>
                <dd>{{ formatBeijingTime(selectedPost.detectedAt) }}</dd>
              </div>
              <div>
                <dt>{{ t('table.createdAt') }}</dt>
                <dd>{{ formatBeijingTime(selectedPost.createdAt) }}</dd>
              </div>
              <div>
                <dt>{{ t('posts.tag.reply') }}</dt>
                <dd>{{ selectedPost.isReply ? t('posts.yes') : t('posts.no') }}</dd>
              </div>
              <div>
                <dt>{{ t('posts.tag.repost') }}</dt>
                <dd>{{ selectedPost.isRepost ? t('posts.yes') : t('posts.no') }}</dd>
              </div>
            </dl>
          </section>

          <section class="post-detail-section">
            <h3>{{ t('posts.deliveryEvents') }}</h3>
            <div v-if="selectedPost.deliveryEvents.length === 0" class="empty-panel">
              {{ t('posts.noDeliveryEvents') }}
            </div>
            <div v-for="event in selectedPost.deliveryEvents" :key="event.id" class="delivery-event-card">
              <dl class="compact-detail-list">
                <div>
                  <dt>{{ t('posts.events.targetKey') }}</dt>
                  <dd><code>{{ event.targetKey }}</code></dd>
                </div>
                <div>
                  <dt>{{ t('posts.events.status') }}</dt>
                  <dd><StatusBadge :status="event.status" /></dd>
                </div>
                <div>
                  <dt>{{ t('posts.events.attemptCount') }}</dt>
                  <dd>{{ event.attemptCount }}</dd>
                </div>
                <div>
                  <dt>{{ t('posts.events.nextRetryAt') }}</dt>
                  <dd>{{ formatBeijingTime(event.nextRetryAt) }}</dd>
                </div>
                <div>
                  <dt>{{ t('posts.events.sentAt') }}</dt>
                  <dd>{{ formatBeijingTime(event.sentAt) }}</dd>
                </div>
                <div>
                  <dt>{{ t('posts.events.lastError') }}</dt>
                  <dd class="wrap">{{ dash(event.lastError) }}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section class="post-detail-section">
            <details>
              <summary>{{ t('posts.rawPayload') }}</summary>
              <pre class="raw-payload">{{ prettyRawPayload(selectedPost.rawPayloadJson) }}</pre>
            </details>
          </section>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import {
  listPosts,
  type AdminPagination,
  type PostBooleanFilter,
  type PostPageQuery,
  type PostsSummary,
  type XPostContent,
} from '../api/admin-api';
import PageHeader from '../components/PageHeader.vue';
import PaginationBar from '../components/PaginationBar.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t } from '../i18n';
import { DEFAULT_PAGE_SIZE, dash, validateTimeRange } from '../utils';

const AUTO_REFRESH_MS = 15_000;

const autoRefreshEnabled = ref(true);
const busy = ref(false);
const filters = reactive({
  authorUsername: '',
  detectedFrom: '',
  detectedTo: '',
  isReply: 'all' as PostBooleanFilter,
  isRepost: 'all' as PostBooleanFilter,
  postedFrom: '',
  postedTo: '',
  query: '',
});
const notice = ref('');
const noticeDanger = ref(false);
const filtersExpanded = ref(false);
const pendingNewCount = ref(0);
const posts = ref<XPostContent[]>([]);
const selectedPost = ref<XPostContent | null>(null);
const summary = ref<PostsSummary>({
  latestDetectedAt: null,
  todayPosts: 0,
  totalPosts: 0,
});
const pagination = ref<AdminPagination>({
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 0,
});

let refreshTimer: number | null = null;
let knownLatestDetectedAt = 0;
let knownTotal = 0;

onMounted(() => {
  void loadPage(1, { silent: true });
  startAutoRefresh();
});

onBeforeUnmount(() => {
  stopAutoRefresh();
  setPostDrawerScrollLock(false);
});

watch(autoRefreshEnabled, (enabled) => {
  if (enabled) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

watch(selectedPost, (post) => {
  setPostDrawerScrollLock(post !== null);
});

async function loadPage(page: number, options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    const result = await listPosts(toQuery(page));
    posts.value = result.posts;
    pagination.value = result.pagination;
    summary.value = result.summary;
    pendingNewCount.value = 0;
    updateKnownBaseline(result.posts, result.pagination.total);

    if (options.silent !== true) {
      setNotice(t('notice.refreshed', { time: new Date().toLocaleString() }));
    }
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    busy.value = false;
  }
}

async function applyFilters(): Promise<void> {
  const errorKey =
    validateTimeRange(filters.postedFrom, filters.postedTo) ??
    validateTimeRange(filters.detectedFrom, filters.detectedTo);

  if (errorKey !== null) {
    setNotice(t('notice.invalidTimeRange'), true);
    return;
  }

  await loadPage(1);
}

async function clearFilters(): Promise<void> {
  filters.authorUsername = '';
  filters.detectedFrom = '';
  filters.detectedTo = '';
  filters.isReply = 'all';
  filters.isRepost = 'all';
  filters.postedFrom = '';
  filters.postedTo = '';
  filters.query = '';
  await loadPage(1);
}

async function manualRefresh(): Promise<void> {
  await loadPage(pagination.value.page);
}

function toggleAutoRefresh(): void {
  autoRefreshEnabled.value = !autoRefreshEnabled.value;
}

async function runAutoRefresh(): Promise<void> {
  if (!autoRefreshEnabled.value || busy.value) {
    return;
  }

  if (pagination.value.page === 1 && selectedPost.value === null) {
    await loadPage(1, { silent: true });
    return;
  }

  try {
    const result = await listPosts(toQuery(1));
    const latestDetectedAt = latestDetectedAtFromPosts(result.posts);
    const newerByTotal = Math.max(0, result.pagination.total - knownTotal);
    const hasNewerLatest = latestDetectedAt > knownLatestDetectedAt;
    const newCount = newerByTotal > 0 ? newerByTotal : hasNewerLatest ? 1 : 0;

    pendingNewCount.value = Math.max(pendingNewCount.value, newCount);
    summary.value = result.summary;
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  }
}

async function showNewContent(): Promise<void> {
  selectedPost.value = null;
  await loadPage(1);
}

function openDetail(post: XPostContent): void {
  selectedPost.value = post;
}

function closeDetail(): void {
  selectedPost.value = null;
}

function setPostDrawerScrollLock(locked: boolean): void {
  document.body.classList.toggle('post-drawer-open', locked);
}

function startAutoRefresh(): void {
  stopAutoRefresh();
  refreshTimer = window.setInterval(() => {
    void runAutoRefresh();
  }, AUTO_REFRESH_MS);
}

function stopAutoRefresh(): void {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function setNotice(message: string, danger = false): void {
  notice.value = message;
  noticeDanger.value = danger;
}

function updateKnownBaseline(nextPosts: XPostContent[], nextTotal: number): void {
  knownLatestDetectedAt = latestDetectedAtFromPosts(nextPosts);
  knownTotal = nextTotal;
}

function latestDetectedAtFromPosts(nextPosts: XPostContent[]): number {
  return nextPosts.reduce((latest, post) => Math.max(latest, toTimestamp(post.detectedAt)), 0);
}

function toTimestamp(value: string | null | undefined): number {
  if (value === null || value === undefined || value.trim().length === 0) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function toQuery(page: number): PostPageQuery {
  return {
    authorUsername: filters.authorUsername,
    detectedFrom: filters.detectedFrom,
    detectedTo: filters.detectedTo,
    isReply: filters.isReply,
    isRepost: filters.isRepost,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    postedFrom: filters.postedFrom,
    postedTo: filters.postedTo,
    query: filters.query,
  };
}

function formatBeijingTime(value: string | null | undefined): string {
  return formatTimeInZone(value, 'Asia/Shanghai');
}

function formatUtcTime(value: string | null | undefined): string {
  return formatTimeInZone(value, 'UTC');
}

function formatTimeInZone(value: string | null | undefined, timeZone: string): string {
  if (value === null || value === undefined || value.trim().length === 0) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return [
    Number(partMap.year),
    '/',
    Number(partMap.month),
    '/',
    Number(partMap.day),
    ' ',
    partMap.hour,
    ':',
    partMap.minute,
    ':',
    partMap.second,
  ].join('');
}

function prettyRawPayload(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
</script>
