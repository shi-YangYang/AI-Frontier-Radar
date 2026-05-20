<template>
  <section>
    <PageHeader :title="t('accounts.title')" :subtitle="t('accounts.subtitle')">
      <form class="inline-form" @submit.prevent="addAccount">
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
  createWatchAccount,
  deleteWatchAccount,
  listWatchAccounts,
  type WatchAccount,
} from '../api/admin-api';
import ConfirmModal from '../components/ConfirmModal.vue';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t } from '../i18n';
import { dash, formatDateTime } from '../utils';

const accounts = ref<WatchAccount[]>([]);
const addingAccount = ref(false);
const busy = ref(false);
const deleteTarget = ref<WatchAccount | null>(null);
const notice = ref('');
const noticeDanger = ref(false);
const username = ref('');

onMounted(() => {
  void loadAccounts({ silent: true });
});

async function loadAccounts(options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    accounts.value = (await listWatchAccounts()).watchAccounts;

    if (options.silent !== true) {
      setNotice(t('notice.refreshed', { time: new Date().toLocaleString() }));
    }
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    busy.value = false;
  }
}

async function addAccount(): Promise<void> {
  addingAccount.value = true;
  setNotice(t('notice.accountValidating'));

  try {
    await createWatchAccount(username.value);
    username.value = '';
    await loadAccounts({ silent: true });
    setNotice(t('notice.accountCreated'));
  } catch (error) {
    setNotice(
      t('notice.accountCreateFailed', {
        error: error instanceof Error ? error.message : String(error),
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
    await loadAccounts({ silent: true });
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
</script>
