<template>
  <div class="pagination">
    <span class="page-info">
      {{ t('pagination.summary', {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: pagination.total,
        totalPages: pagination.totalPages,
      }) }}
    </span>
    <button type="button" :disabled="busy || pagination.page <= 1" @click="emit('changePage', pagination.page - 1)">
      {{ t('actions.previousPage') }}
    </button>
    <button
      type="button"
      :disabled="busy || pagination.totalPages === 0 || pagination.page >= pagination.totalPages"
      @click="emit('changePage', pagination.page + 1)"
    >
      {{ t('actions.nextPage') }}
    </button>
    <form class="page-jump" @submit.prevent="jump">
      <input v-model="pageInput" :placeholder="t('form.pagePlaceholder')" inputmode="numeric" />
      <button type="submit" :disabled="busy">{{ t('pagination.jump') }}</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import type { AdminPagination } from '../api/admin-api';
import { t } from '../i18n';

const props = defineProps<{
  busy?: boolean;
  pagination: AdminPagination;
}>();

const emit = defineEmits<{
  changePage: [page: number];
  invalidPage: [];
}>();

const pageInput = ref('');

function jump(): void {
  const trimmed = pageInput.value.trim();

  if (!/^-?\d+$/.test(trimmed)) {
    emit('invalidPage');
    return;
  }

  const parsed = Number(trimmed);

  if (!Number.isSafeInteger(parsed)) {
    emit('invalidPage');
    return;
  }

  const maxPage = props.pagination.totalPages === 0 ? 1 : props.pagination.totalPages;
  emit('changePage', Math.min(Math.max(parsed, 1), maxPage));
  pageInput.value = '';
}
</script>
