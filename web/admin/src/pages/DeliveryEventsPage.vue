<template>
  <section>
    <PageHeader :title="t('delivery.title')" :subtitle="t('delivery.subtitle')">
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
              <th>{{ t('table.createdAt') }}</th>
              <th>{{ t('table.postId') }}</th>
              <th>{{ t('table.target') }}</th>
              <th>{{ t('table.status') }}</th>
              <th>{{ t('table.attemptCount') }}</th>
              <th>{{ t('table.nextRetryAt') }}</th>
              <th>{{ t('table.sentAt') }}</th>
              <th>{{ t('table.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="deliveryEvents.length === 0">
              <td colspan="8" class="empty-cell">{{ t('delivery.empty') }}</td>
            </tr>
            <tr v-for="event in deliveryEvents" :key="event.id">
              <td>{{ formatDateTime(event.createdAt) }}</td>
              <td><code>{{ event.xPostId }}</code></td>
              <td><code>{{ event.targetKey }}</code></td>
              <td><StatusBadge :status="event.status" /></td>
              <td>{{ event.attemptCount }}</td>
              <td>{{ formatDateTime(event.nextRetryAt) }}</td>
              <td>{{ formatDateTime(event.sentAt) }}</td>
              <td>
                <button class="danger" type="button" :disabled="busy" @click="askDelete(event)">
                  {{ t('actions.delete') }}
                </button>
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
      :title="t('delivery.deleteTitle')"
      :body="deleteTarget === null ? '' : deleteTarget.xPostId"
      :detail="deleteTarget === null ? '' : deleteDetail(deleteTarget)"
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import {
  deleteDeliveryEvent,
  listDeliveryEvents,
  type AdminPagination,
  type DeliveryEvent,
  type PageQuery,
} from '../api/admin-api';
import ConfirmModal from '../components/ConfirmModal.vue';
import PageHeader from '../components/PageHeader.vue';
import PaginationBar from '../components/PaginationBar.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t } from '../i18n';
import { DEFAULT_PAGE_SIZE, formatDateTime, validateTimeRange } from '../utils';

const busy = ref(false);
const deleteTarget = ref<DeliveryEvent | null>(null);
const deliveryEvents = ref<DeliveryEvent[]>([]);
const filters = reactive({ from: '', to: '' });
const notice = ref('');
const noticeDanger = ref(false);
const pagination = ref<AdminPagination>({
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 0,
});

onMounted(() => {
  void loadPage(1, { silent: true });
});

async function loadPage(page: number, options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    const result = await listDeliveryEvents(toQuery(page));
    deliveryEvents.value = result.deliveryEvents;
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

function askDelete(event: DeliveryEvent): void {
  deleteTarget.value = event;
}

async function confirmDelete(): Promise<void> {
  if (deleteTarget.value === null) {
    return;
  }

  busy.value = true;

  try {
    await deleteDeliveryEvent(deleteTarget.value.id);
    deleteTarget.value = null;
    await loadPage(pagination.value.page, { silent: true });
    setNotice(t('notice.deliveryEventDeleted'));
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    busy.value = false;
  }
}

function deleteDetail(event: DeliveryEvent): string {
  return ['pending', 'retry_wait', 'sending'].includes(event.status)
    ? t('delivery.deletePendingBody')
    : t('delivery.deleteBody');
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
