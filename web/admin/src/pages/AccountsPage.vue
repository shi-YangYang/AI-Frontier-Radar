<template>
  <section>
    <PageHeader :title="t('accounts.title')" :subtitle="t('accounts.subtitle')">
      <form class="inline-form account-add-form" @submit.prevent="addAccount">
        <input
          v-model="username"
          autocomplete="off"
          :disabled="addingAccount"
          :placeholder="t('accounts.placeholder')"
        />
        <button class="primary" type="submit" :disabled="busy || addingAccount">
          {{ addingAccount ? t('accounts.validating') : t('accounts.add') }}
        </button>
      </form>
    </PageHeader>

    <ToastNotice :message="notice" :danger="noticeDanger" />

    <div class="panel">
      <form class="query-form" @submit.prevent="applyQuery">
        <label>
          <span>{{ t('accounts.queryLabel') }}</span>
          <input
            v-model="queryInput"
            autocomplete="off"
            :disabled="busy"
            :placeholder="t('accounts.queryPlaceholder')"
          />
        </label>
        <button class="primary" type="submit" :disabled="busy">{{ t('actions.query') }}</button>
        <button type="button" :disabled="busy" @click="clearQuery">{{ t('accounts.clearQuery') }}</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('table.account') }}</th>
              <th>{{ t('table.lastPolledAt') }}</th>
              <th>{{ t('table.lastPollStatus') }}</th>
              <th>{{ t('table.baselinePost') }}</th>
              <th>{{ t('table.latestPost') }}</th>
              <th>{{ t('table.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="accounts.length === 0">
              <td colspan="6" class="empty-cell">{{ t('accounts.empty') }}</td>
            </tr>
            <tr v-for="account in accounts" :key="account.id">
              <td>
                <strong>@{{ account.xUsername }}</strong>
                <div class="muted">{{ account.displayName ?? '-' }}</div>
              </td>
              <td>{{ formatDateTime(account.lastPolledAt) }}</td>
              <td><StatusBadge :status="account.lastPollStatus" /></td>
              <td><code>{{ dash(account.baselinePostId) }}</code></td>
              <td><code>{{ dash(account.lastSeenPostId) }}</code></td>
              <td>
                <button class="danger" type="button" :disabled="busy" @click="askDelete(account)">
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
        @change-page="loadAccounts"
        @invalid-page="setNotice(t('notice.invalidPage'), true)"
      />
    </div>

    <ConfirmModal
      :open="deleteTarget !== null"
      :title="t('accounts.deleteTitle')"
      :body="deleteTarget === null ? '' : '@' + deleteTarget.xUsername"
      :detail="t('accounts.deleteBody')"
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import {
  AdminApiRequestError,
  createWatchAccount,
  deleteWatchAccount,
  listWatchAccounts,
  type AdminPagination,
  type WatchAccount,
} from '../api/admin-api';
import ConfirmModal from '../components/ConfirmModal.vue';
import PageHeader from '../components/PageHeader.vue';
import PaginationBar from '../components/PaginationBar.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t } from '../i18n';
import { DEFAULT_PAGE_SIZE, dash, formatDateTime } from '../utils';

const accounts = ref<WatchAccount[]>([]);
const activeQuery = ref('');
const addingAccount = ref(false);
const busy = ref(false);
const deleteTarget = ref<WatchAccount | null>(null);
const notice = ref('');
const noticeDanger = ref(false);
const pagination = ref<AdminPagination>({
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 0,
});
const queryInput = ref('');
const username = ref('');

onMounted(() => {
  void loadAccounts(1, { silent: true });
});

async function loadAccounts(page: number, options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    const result = await listWatchAccounts({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      query: activeQuery.value,
    });
    accounts.value = result.watchAccounts;
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

async function applyQuery(): Promise<void> {
  activeQuery.value = normalizeQuery(queryInput.value);
  queryInput.value = activeQuery.value;
  await loadAccounts(1);
}

async function clearQuery(): Promise<void> {
  queryInput.value = '';
  activeQuery.value = '';
  await loadAccounts(1);
}

async function addAccount(): Promise<void> {
  addingAccount.value = true;
  setNotice(t('notice.accountValidating'));

  try {
    await createWatchAccount(username.value);
    username.value = '';
    await loadAccounts(1, { silent: true });
    setNotice(t('notice.accountCreated'));
  } catch (error) {
    setNotice(
      t('notice.accountCreateFailed', {
        error: toAccountCreateErrorMessage(error),
      }),
      true,
    );
  } finally {
    addingAccount.value = false;
  }
}

function askDelete(account: WatchAccount): void {
  deleteTarget.value = account;
}

async function confirmDelete(): Promise<void> {
  if (deleteTarget.value === null) {
    return;
  }

  busy.value = true;

  try {
    await deleteWatchAccount(deleteTarget.value.id);
    deleteTarget.value = null;
    await loadAccountsAfterDelete();
    setNotice(t('notice.accountDeleted'));
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

function toAccountCreateErrorMessage(error: unknown): string {
  if (error instanceof AdminApiRequestError) {
    if (error.code === 'SOURCE_REQUEST_FAILED') {
      return t('accounts.error.network');
    }

    if (error.code === 'SOURCE_AUTH_FAILED') {
      return t('accounts.error.loginRequired');
    }

    if (error.code === 'SOURCE_RATE_LIMITED') {
      return t('accounts.error.rateLimited');
    }

    if (error.code === 'SOURCE_RESPONSE_INVALID') {
      return t('accounts.error.pageUnreadable');
    }

    if (error.code === 'SOURCE_ACCOUNT_NOT_FOUND') {
      return t('accounts.error.accountNotFound');
    }

    if (error.code === 'SOURCE_INVALID_INPUT') {
      return t('accounts.error.invalidInput');
    }

    if (error.code === 'SOURCE_VALIDATION_UNAVAILABLE') {
      return t('accounts.error.validationUnavailable');
    }
  }

  return error instanceof Error ? error.message : String(error);
}

async function loadAccountsAfterDelete(): Promise<void> {
  await loadAccounts(pagination.value.page, { silent: true });

  if (accounts.value.length === 0 && pagination.value.page > 1) {
    const fallbackPage = pagination.value.totalPages > 0 ? pagination.value.totalPages : pagination.value.page - 1;
    await loadAccounts(fallbackPage, { silent: true });
  }
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/^@+/, '');
}
</script>
