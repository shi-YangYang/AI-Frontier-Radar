<template>
  <section>
    <PageHeader :title="t('accounts.title')" :subtitle="t('accounts.subtitle')">
      <form class="inline-form account-add-form" @submit.prevent="addAccount">
        <select v-model="sourceType" :disabled="addingAccount">
          <option value="x">{{ t('accounts.sourceTypeX') }}</option>
          <option value="rss">{{ t('accounts.sourceTypeRss') }}</option>
        </select>
        <input
          v-if="sourceType === 'x'"
          v-model="username"
          autocomplete="off"
          :disabled="addingAccount"
          :placeholder="t('accounts.placeholder')"
        />
        <input
          v-else
          v-model="sourceUrl"
          autocomplete="off"
          :disabled="addingAccount"
          :placeholder="t('accounts.rssPlaceholder')"
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
              <th>{{ t('table.source') }}</th>
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
                <strong>
                  <span class="status-badge neutral source-type-badge">
                    {{ account.sourceType === 'rss' ? 'RSS' : 'X' }}
                  </span>
                  {{ toAccountLabel(account) }}
                </strong>
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
      :body="deleteTarget === null ? '' : toAccountLabel(deleteTarget)"
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
  type WatchAccountSourceType,
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
const sourceType = ref<WatchAccountSourceType>('x');
const sourceUrl = ref('');
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
    if (sourceType.value === 'rss') {
      await createWatchAccount({ sourceType: 'rss', sourceUrl: sourceUrl.value });
      sourceUrl.value = '';
    } else {
      await createWatchAccount({ sourceType: 'x', xUsername: username.value });
      username.value = '';
    }

    await loadAccounts(1, { silent: true });
    setNotice(t('notice.accountCreated'));
  } catch (error) {
    setNotice(
      t('notice.accountCreateFailed', {
        error: toAccountCreateErrorMessage(error, sourceType.value),
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

function toAccountCreateErrorMessage(
  error: unknown,
  sourceType: WatchAccountSourceType,
): string {
  if (error instanceof AdminApiRequestError) {
    const isRss = sourceType === 'rss';

    if (error.code === 'SOURCE_REQUEST_FAILED') {
      return t(isRss ? 'accounts.error.rssNetwork' : 'accounts.error.network');
    }

    if (error.code === 'SOURCE_AUTH_FAILED') {
      return t('accounts.error.loginRequired');
    }

    if (error.code === 'SOURCE_RATE_LIMITED') {
      return t('accounts.error.rateLimited');
    }

    if (error.code === 'SOURCE_RESPONSE_INVALID') {
      return t(isRss ? 'accounts.error.rssPageUnreadable' : 'accounts.error.pageUnreadable');
    }

    if (error.code === 'SOURCE_ACCOUNT_NOT_FOUND') {
      return t(isRss ? 'accounts.error.rssAccountNotFound' : 'accounts.error.accountNotFound');
    }

    if (error.code === 'SOURCE_INVALID_INPUT') {
      return t(isRss ? 'accounts.error.rssInvalidInput' : 'accounts.error.invalidInput');
    }

    if (error.code === 'SOURCE_VALIDATION_UNAVAILABLE') {
      return t(
        isRss
          ? 'accounts.error.rssValidationUnavailable'
          : 'accounts.error.validationUnavailable',
      );
    }
  }

  return error instanceof Error ? error.message : String(error);
}

function toAccountLabel(account: WatchAccount): string {
  if (account.sourceType === 'rss') {
    return account.sourceUrl ?? account.id;
  }

  return account.xUsername === null ? account.id : `@${account.xUsername}`;
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
