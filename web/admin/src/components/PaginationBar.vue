<template>
  <div v-if="pagination.total > 0" class="pagination">
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
  </div>
</template>

<script setup lang="ts">
import type { AdminPagination } from '../api/admin-api';
import { t } from '../i18n';

defineProps<{
  busy?: boolean;
  pagination: AdminPagination;
}>();

const emit = defineEmits<{
  changePage: [page: number];
  invalidPage: [];
}>();
</script>
