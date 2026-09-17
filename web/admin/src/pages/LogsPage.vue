<template>
  <section>
    <PageHeader :title="t('logs.title')" :subtitle="t('logs.subtitle')">
      <div class="toolbar">
        <SelectControl
          :model-value="levelFilter"
          :options="levelOptions"
          @update:model-value="levelFilter = $event"
        />
        <button type="button" :disabled="busy" @click="loadLogs">{{ t('actions.refresh') }}</button>
        <button
          type="button"
          :class="{ primary: autoRefreshEnabled }"
          :aria-pressed="autoRefreshEnabled"
          @click="toggleAutoRefresh"
        >
          {{ autoRefreshEnabled ? t('logs.autoRefreshOn') : t('logs.autoRefreshOff') }}
        </button>
      </div>
    </PageHeader>

    <ToastNotice :message="notice" :danger="noticeDanger" />

    <div class="panel">
      <div class="bulk-actions">
        <span class="muted">{{ t('logs.bufferUsage', { capacity, size }) }}</span>
      </div>
      <EmptyState v-if="entries.length === 0" :title="t('logs.emptyTitle')" :description="t('logs.empty')" />
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('logs.time') }}</th>
              <th>{{ t('logs.level') }}</th>
              <th>{{ t('logs.module') }}</th>
              <th>{{ t('logs.message') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, index) in entries" :key="`${entry.time}-${index}`">
              <td :title="entry.time">{{ formatRelativeTime(entry.time) }}</td>
              <td><StatusBadge :status="entry.level" /></td>
              <td><code>{{ moduleOf(entry) }}</code></td>
              <td class="log-message" :title="fullMessage(entry)">{{ messageOf(entry) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { AdminApiRequestError, listLogs, type LogBufferEntry } from '../api/admin-api';
import EmptyState from '../components/EmptyState.vue';
import PageHeader from '../components/PageHeader.vue';
import SelectControl from '../components/SelectControl.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t } from '../i18n';
import { formatRelativeTime } from '../utils';

const AUTO_REFRESH_INTERVAL_MS = 5_000;
const LOG_FETCH_LIMIT = 200;

const autoRefreshEnabled = ref(true);
const busy = ref(false);
const capacity = ref(0);
const entries = ref<LogBufferEntry[]>([]);
const levelFilter = ref('all');
const notice = ref('');
const noticeDanger = ref(false);
const size = ref(0);
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

const levelOptions = computed(() => [
  { label: t('logs.levelAll'), value: 'all' },
  { label: 'info', value: 'info' },
  { label: 'warn', value: 'warn' },
  { label: 'error', value: 'error' },
]);

async function loadLogs(): Promise<void> {
  busy.value = true;

  try {
    const result = await listLogs({
      limit: LOG_FETCH_LIMIT,
      ...(levelFilter.value === 'all' ? {} : { level: levelFilter.value }),
    });

    entries.value = result.entries;
    capacity.value = result.capacity;
    size.value = result.size;
  } catch (error) {
    notice.value =
      error instanceof AdminApiRequestError ? error.message : t('logs.loadFailed');
    noticeDanger.value = true;
  } finally {
    busy.value = false;
  }
}

function toggleAutoRefresh(): void {
  autoRefreshEnabled.value = !autoRefreshEnabled.value;
  syncAutoRefreshTimer();
}

function syncAutoRefreshTimer(): void {
  if (autoRefreshTimer !== null) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }

  if (autoRefreshEnabled.value) {
    autoRefreshTimer = setInterval(() => {
      void loadLogs();
    }, AUTO_REFRESH_INTERVAL_MS);
  }
}

function moduleOf(entry: LogBufferEntry): string {
  const value = entry.module;

  return typeof value === 'string' && value.length > 0 ? value : '-';
}

function messageOf(entry: LogBufferEntry): string {
  const value = entry.msg ?? entry.message;

  return typeof value === 'string' ? value : JSON.stringify(value ?? '');
}

function fullMessage(entry: LogBufferEntry): string {
  return JSON.stringify(entry, null, 2);
}

watch(levelFilter, () => {
  void loadLogs();
});

onMounted(() => {
  void loadLogs();
  syncAutoRefreshTimer();
});

onBeforeUnmount(() => {
  if (autoRefreshTimer !== null) {
    clearInterval(autoRefreshTimer);
  }
});
</script>
