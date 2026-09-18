<template>
  <section>
    <PageHeader :subtitle="t('overview.subtitle')">
      <div class="toolbar">
        <button type="button" :disabled="busy" @click="() => loadSummary()">{{ t('actions.refresh') }}</button>
        <button class="primary" type="button" :disabled="busy" @click="runPoll">{{ t('actions.pollNow') }}</button>
        <button type="button" :disabled="busy" @click="runDelivery">{{ t('actions.deliveryNow') }}</button>
      </div>
    </PageHeader>

    <ToastNotice :message="notice" :danger="noticeDanger" />

    <div class="metric-grid">
      <RouterLink class="metric-card metric-card-link" to="/accounts">
        <span>{{ t('overview.metrics.sources') }}</span>
        <strong>
          {{ summary?.enabledWatchAccountsCount ?? '-' }}
          <small>/ {{ summary?.watchAccountsCount ?? '-' }}</small>
        </strong>
        <small class="metric-card-hint">{{ t('overview.metrics.sourcesHint') }}</small>
      </RouterLink>
      <RouterLink class="metric-card metric-card-link" to="/posts">
        <span>{{ t('overview.metrics.todayPosts') }}</span>
        <strong>{{ postsSummary?.todayPosts ?? '-' }}</strong>
        <small class="metric-card-hint">{{ t('overview.metrics.todayPostsHint') }}</small>
      </RouterLink>
      <RouterLink class="metric-card metric-card-link" to="/delivery-events">
        <span>{{ t('overview.metrics.pending') }}</span>
        <strong>{{ pendingDeliveryCount }}</strong>
        <small class="metric-card-hint">{{ t('overview.metrics.pendingHint') }}</small>
      </RouterLink>
      <RouterLink class="metric-card metric-card-link" to="/poll-runs">
        <span>{{ t('overview.metrics.latestPoll') }}</span>
        <strong class="metric-poll">
          <StatusBadge :status="summary?.latestPollRun?.status" />
          <small class="muted">{{ formatRelativeTime(summary?.latestPollRun?.startedAt) }}</small>
        </strong>
        <small class="metric-card-hint">{{ pollProgressText }}</small>
      </RouterLink>
    </div>

    <div class="panel-grid overview-grid">
      <article class="panel">
        <header class="panel-header">
          <div>
            <h2>{{ t('overview.latestPosts') }}</h2>
            <p>{{ t('overview.latestPostsHint') }}</p>
          </div>
          <RouterLink class="button-link" to="/posts">{{ t('overview.viewAll') }}</RouterLink>
        </header>

        <EmptyState
          v-if="latestPosts.length === 0"
          :title="t('overview.noPostsTitle')"
          :description="t('overview.noPosts')"
        />
        <ul v-else class="latest-post-list">
          <li v-for="post in latestPosts" :key="post.id" class="latest-post-item">
            <div class="latest-post-main">
              <span class="latest-post-author">{{ post.authorUsername }}</span>
              <p class="latest-post-text">{{ post.textContent }}</p>
            </div>
            <div class="latest-post-meta">
              <span class="muted" :title="formatDateTime(post.postedAt)">
                {{ formatRelativeTime(post.postedAt) }}
              </span>
              <a :href="post.permalinkUrl" target="_blank" rel="noreferrer">
                {{ t('posts.openOriginal') }}
              </a>
            </div>
          </li>
        </ul>
      </article>

      <div class="overview-side">
        <article class="panel">
          <header class="panel-header">
            <h2>{{ t('overview.latestPollRun') }}</h2>
            <StatusBadge :status="summary?.latestPollRun?.status" />
          </header>
          <dl class="detail-list">
            <div>
              <dt>{{ t('table.startedAt') }}</dt>
              <dd :title="formatDateTime(summary?.latestPollRun?.startedAt)">
                {{ formatRelativeTime(summary?.latestPollRun?.startedAt) }}
              </dd>
            </div>
            <div>
              <dt>{{ t('table.pollProgress') }}</dt>
              <dd>{{ pollProgressText }}</dd>
            </div>
            <div>
              <dt>{{ t('table.newPosts') }}</dt>
              <dd>{{ summary?.latestPollRun?.newPostsDetected ?? '-' }}</dd>
            </div>
          </dl>
        </article>

        <article class="panel">
          <header class="panel-header">
            <h2>{{ t('overview.service') }}</h2>
          </header>
          <dl class="detail-list">
            <div>
              <dt>{{ t('overview.sourceMode') }}</dt>
              <dd><code>{{ summary?.sourceMode ?? '-' }}</code></dd>
            </div>
            <div>
              <dt>{{ t('overview.watchSource') }}</dt>
              <dd><code>{{ summary?.watchAccountsSource ?? '-' }}</code></dd>
            </div>
            <div>
              <dt>{{ t('overview.deliveryReady') }}</dt>
              <dd><StatusBadge :status="summary?.feishuWebhookConfigured ? 'success' : 'failed'" /></dd>
            </div>
            <div>
              <dt>{{ t('overview.service') }}</dt>
              <dd><code>{{ summary?.service.name ?? '-' }}:{{ summary?.service.port ?? '-' }}</code></dd>
            </div>
          </dl>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import {
  getSummary,
  listPosts,
  runDeliveryNow,
  runPollingNow,
  type AdminSummary,
  type PostsSummary,
  type XPostContent,
} from '../api/admin-api';
import EmptyState from '../components/EmptyState.vue';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t } from '../i18n';
import {
  formatDateTime,
  formatRelativeTime,
  pollProgress,
  translateJob,
  translateStatus,
} from '../utils';

const busy = ref(false);
const latestPosts = ref<XPostContent[]>([]);
const notice = ref('');
const noticeDanger = ref(false);
const postsSummary = ref<PostsSummary | null>(null);
const summary = ref<AdminSummary | null>(null);

const pendingDeliveryCount = computed(() => {
  const counts = summary.value?.deliveryEventStatusCounts;

  return (counts?.pending ?? 0) + (counts?.retry_wait ?? 0);
});

const pollProgressText = computed(() =>
  summary.value?.latestPollRun === null || summary.value?.latestPollRun === undefined
    ? '-'
    : pollProgress(summary.value.latestPollRun),
);

onMounted(() => {
  void loadSummary({ silent: true });
});

async function loadSummary(options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    const [loadedSummary, loadedPosts] = await Promise.all([
      getSummary(),
      listPosts({ page: 1, pageSize: 5 }),
    ]);
    summary.value = loadedSummary;
    latestPosts.value = loadedPosts.posts;
    postsSummary.value = loadedPosts.summary;

    if (options.silent !== true) {
      setNotice(t('notice.refreshed', { time: new Date().toLocaleString() }));
    }
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    busy.value = false;
  }
}

async function runPoll(): Promise<void> {
  await runAction(() => runPollingNow());
}

async function runDelivery(): Promise<void> {
  await runAction(() => runDeliveryNow());
}

async function runAction(action: () => Promise<{ job: string; status: string }>): Promise<void> {
  busy.value = true;

  try {
    const result = await action();
    const [loadedSummary, loadedPosts] = await Promise.all([
      getSummary(),
      listPosts({ page: 1, pageSize: 5 }),
    ]);
    summary.value = loadedSummary;
    latestPosts.value = loadedPosts.posts;
    postsSummary.value = loadedPosts.summary;
    setNotice(t('notice.actionResult', {
      job: translateJob(result.job),
      status: translateStatus(result.status),
    }));
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    busy.value = false;
  }
}

function setNotice(message: string, danger = false): void {
  notice.value = message;
  noticeDanger.value = danger;
}
</script>
