<script setup lang="ts">
import { t } from '../i18n';

defineProps<{
  description?: string;
  title?: string;
}>();
</script>

<template>
  <div class="empty-state">
    <p class="empty-state-title">{{ title ?? t('empty.title') }}</p>
    <p v-if="description !== undefined" class="empty-state-description">{{ description }}</p>
    <div v-if="$slots.action" class="empty-state-action">
      <slot name="action" />
    </div>
  </div>
</template>
