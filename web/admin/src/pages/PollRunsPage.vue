<template>
  <section>
    <PageHeader :title="t('poll.title')" :subtitle="t('poll.subtitle')">
      <form class="filter-form" @submit.prevent="applyFilters">
        <label>
          <span>{{ t('form.fromTime') }}</span>
          <input v-model="filters.from" type="datetime-local" />
        </label>
        <label>
          <span>{{ t('form.toTime') }}</span>
          <input v-model="filters.to" type="datetime-local" />
        </label>
        <button class="primary" type="submit" :disabled="busy">{{ t('actions.query') }}</button>
        <button type="button" :disabled="busy" @click="clearFilters">{{ t('actions.clearQuery') }}</button>
      </form>
    </PageHeader>

    <ToastNotice :message="notice" :danger="noticeDanger" />

    <div class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('table.startedAt') }}</th>
              <th>{{ t('table.finishedAt') }}</th>
              <th>{{ t('table.status') }}</th>
              <th>{{ t('table.pollProgress') }}</th>
              <th>{{ t('table.newPosts') }}</th>
              <th>{{ t('table.pendingEvents') }}</th>
              <th>{{ t('table.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="pollRuns.length === 0">
              <td colspan="7" class="empty-cell">{{ t('poll.empty') }}</td>
            </tr>
            <tr v-for="run in pollRuns" :key="run.id">
              <td>{{ formatDateTime(run.startedAt) }}</td>
              <td>{{ formatDateTime(run.finishedAt) }}</td>
              <td><StatusBadge :status="run.status" /></td>
              <td>{{ pollProgress(run) }}</td>
              <td>{{ run.newPostsDetected }}</td>
              <td>{{ run.eventsCreated }}</td>
              <td>
                <div class="action-row">
                  <button v-if="run.errorSummary" type="button" @click="openError(run)">
                    {{ t('actions.viewError') }}
                  </button>
                  <button class="danger" type="button" :disabled="busy" @click="askDelete(run)">
                    {{ t('actions.delete') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationBar
        :busy="busy"
        :pagination="pagination"
        @change-page="loadPage"
        @invalid-page="setNotice(t('notice.invalidPage'), true)"
      />
    </div>

    <ConfirmModal
      :open="deleteTarget !== null"
      :title="t('poll.deleteTitle')"
      :body="deleteTarget === null ? '' : formatDateTime(deleteTarget.startedAt)"
      :detail="t('poll.deleteBody')"
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />
    <ErrorModal
      :open="errorSummary !== null"
      :error-summary="errorSummary"
      @close="errorSummary = null"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import {
  deletePollRun,
  listPollRuns,
  type AdminPagination,
  type PageQuery,
  type PollRun,
} from '../api/admin-api';
import ConfirmModal from '../components/ConfirmModal.vue';
import ErrorModal from '../components/ErrorModal.vue';
import PageHeader from '../components/PageHeader.vue';
import PaginationBar from '../components/PaginationBar.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t } from '../i18n';
import { DEFAULT_PAGE_SIZE, formatDateTime, pollProgress, validateTimeRange } from '../utils';

const busy = ref(false);
const deleteTarget = ref<PollRun | null>(null);
const errorSummary = ref<string | null>(null);
const filters = reactive({ from: '', to: '' });
const notice = ref('');
const noticeDanger = ref(false);
const pagination = ref<AdminPagination>({
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 0,
});
const pollRuns = ref<PollRun[]>([]);

onMounted(() => {
  void loadPage(1, { silent: true });
});

async function loadPage(page: number, options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    const result = await listPollRuns(toQuery(page));
    pollRuns.value = result.pollRuns;
    pagination.value = result.pagination;

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
  const errorKey = validateTimeRange(filters.from, filters.to);

  if (errorKey !== null) {
    setNotice(t('notice.invalidTimeRange'), true);
    return;
  }

  await loadPage(1);
}

async function clearFilters(): Promise<void> {
  filters.from = '';
  filters.to = '';
  await loadPage(1);
}

function askDelete(run: PollRun): void {
  deleteTarget.value = run;
}

async function confirmDelete(): Promise<void> {
  if (deleteTarget.value === null) {
    return;
  }

  busy.value = true;

  try {
    await deletePollRun(deleteTarget.value.id);
    deleteTarget.value = null;
    await loadPage(pagination.value.page, { silent: true });
    setNotice(t('notice.pollRunDeleted'));
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    busy.value = false;
  }
}

function openError(run: PollRun): void {
  errorSummary.value = run.errorSummary;
}

function setNotice(message: string, danger = false): void {
  notice.value = message;
  noticeDanger.value = danger;
}

function toQuery(page: number): PageQuery {
  return {
    from: filters.from,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    to: filters.to,
  };
}
</script>
