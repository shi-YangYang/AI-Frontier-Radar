<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
      <section class="modal wide" role="dialog" aria-modal="true" aria-labelledby="error-modal-title">
        <header class="modal-header">
          <h2 id="error-modal-title">{{ t('modal.errorTitle') }}</h2>
          <button class="icon-button" type="button" :aria-label="t('actions.close')" @click="emit('close')">
            ×
          </button>
        </header>
        <div class="modal-body">
          <div v-if="parsedErrors.length === 1 && parsedErrors[0].account === null" class="raw-error">
            {{ parsedErrors[0].error }}
          </div>
          <div v-else class="table-wrap">
            <table class="compact-table">
              <thead>
                <tr>
                  <th>{{ t('modal.accountColumn') }}</th>
                  <th>{{ t('modal.errorColumn') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in parsedErrors" :key="index">
                  <td>{{ item.account ?? '-' }}</td>
                  <td class="wrap">{{ item.error }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <footer class="modal-footer">
          <button type="button" @click="emit('close')">{{ t('actions.close') }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';

import { t } from '../i18n';

const props = defineProps<{
  errorSummary: string | null;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const parsedErrors = computed(() => parseErrorSummary(props.errorSummary));

function parseErrorSummary(raw: string | null): Array<{ account: null | string; error: string }> {
  if (raw === null || raw.trim().length === 0) {
    return [{ account: null, error: '-' }];
  }

  const entries = raw
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    return [{ account: null, error: raw }];
  }

  return entries.map((entry) => {
    const separatorIndex = entry.indexOf(':');

    if (separatorIndex <= 0) {
      return { account: null, error: entry };
    }

    const account = entry.slice(0, separatorIndex).trim();
    const error = entry.slice(separatorIndex + 1).trim();

    if (account.length === 0 || error.length === 0) {
      return { account: null, error: entry };
    }

    return { account, error };
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>
