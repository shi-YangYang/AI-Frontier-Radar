<template>
  <section>
    <PageHeader :title="t('overview.title')" :subtitle="t('overview.subtitle')">
      <div class="toolbar">
        <button type="button" :disabled="busy" @click="() => loadSummary()">{{ t('actions.refresh') }}</button>
        <button class="primary" type="button" :disabled="busy" @click="runPoll">{{ t('actions.pollNow') }}</button>
        <button type="button" :disabled="busy" @click="runDelivery">{{ t('actions.deliveryNow') }}</button>
      </div>
    </PageHeader>

    <ToastNotice :message="notice" :danger="noticeDanger" />

    <div class="metric-grid">
      <article class="metric-card">
        <span>{{ t('summary.totalAccounts') }}</span>
        <strong>{{ summary?.watchAccountsCount ?? '-' }}</strong>
      </article>
      <article class="metric-card">
        <span>{{ t('summary.enabledAccounts') }}</span>
        <strong>{{ summary?.enabledWatchAccountsCount ?? '-' }}</strong>
      </article>
      <article class="metric-card">
        <span>{{ t('summary.pendingDelivery') }}</span>
        <strong>{{ summary?.deliveryEventStatusCounts.pending ?? 0 }}</strong>
      </article>
      <article class="metric-card">
        <span>{{ t('summary.retryWait') }}</span>
        <strong>{{ summary?.deliveryEventStatusCounts.retry_wait ?? 0 }}</strong>
      </article>
      <article class="metric-card">
        <span>{{ t('summary.sentDelivery') }}</span>
        <strong>{{ summary?.deliveryEventStatusCounts.sent ?? 0 }}</strong>
      </article>
    </div>

    <div class="panel-grid">
      <article class="panel">
        <header class="panel-header">
          <h2>{{ t('overview.latestPollRun') }}</h2>
          <StatusBadge :status="summary?.latestPollRun?.status" />
        </header>
        <dl class="detail-list">
          <div>
            <dt>{{ t('table.startedAt') }}</dt>
            <dd>{{ formatDateTime(summary?.latestPollRun?.startedAt) }}</dd>
          </div>
          <div>
            <dt>{{ t('table.finishedAt') }}</dt>
            <dd>{{ formatDateTime(summary?.latestPollRun?.finishedAt) }}</dd>
          </div>
          <div>
            <dt>{{ t('table.pollProgress') }}</dt>
            <dd>{{ summary?.latestPollRun ? pollProgress(summary.latestPollRun) : '-' }}</dd>
          </div>
          <div>
            <dt>{{ t('table.newPosts') }}</dt>
            <dd>{{ summary?.latestPollRun?.newPostsDetected ?? '-' }}</dd>
          </div>
          <div>
            <dt>{{ t('table.pendingEvents') }}</dt>
            <dd>{{ summary?.latestPollRun?.eventsCreated ?? '-' }}</dd>
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

    <div class="entry-grid">
      <RouterLink class="entry-link" to="/accounts">{{ t('overview.entryAccounts') }}</RouterLink>
      <RouterLink class="entry-link" to="/poll-runs">{{ t('overview.entryPollRuns') }}</RouterLink>
      <RouterLink class="entry-link" to="/delivery-events">{{ t('overview.entryDelivery') }}</RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { getSummary, runDeliveryNow, runPollingNow, type AdminSummary } from '../api/admin-api';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t } from '../i18n';
import { formatDateTime, pollProgress, translateJob, translateStatus } from '../utils';

const busy = ref(false);
const notice = ref('');
const noticeDanger = ref(false);
const summary = ref<AdminSummary | null>(null);

onMounted(() => {
  void loadSummary({ silent: true });
});

async function loadSummary(options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    summary.value = await getSummary();

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
    summary.value = await getSummary();
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
