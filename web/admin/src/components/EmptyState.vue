<script setup lang="ts">
import { t } from '../i18n';

defineProps<{
  description?: string;
  title?: string;
}>();
</script>

<template>
  <div class="empty-state">
    <svg class="admin-empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <rect x="9" y="7" width="30" height="34" rx="6" />
      <path d="M17 17h14M17 23h9M17 29h5" />
      <circle cx="34" cy="34" r="8" fill="var(--panel)" />
      <path d="m31 34 2 2 4-4" />
    </svg>
    <p class="empty-state-title">{{ title ?? t('empty.title') }}</p>
    <p v-if="description !== undefined" class="empty-state-description">{{ description }}</p>
    <div v-if="$slots.action" class="empty-state-action">
      <slot name="action" />
    </div>
  </div>
</template>
