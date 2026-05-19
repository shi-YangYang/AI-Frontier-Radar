<template>
  <span class="status-badge" :class="tone">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { translateStatus } from '../utils';

const props = defineProps<{
  status: string | null | undefined;
}>();

const label = computed(() => translateStatus(props.status));
const tone = computed(() => {
  switch (props.status) {
    case 'success':
    case 'sent':
      return 'good';
    case 'failed':
    case 'dead':
      return 'bad';
    case 'partial_failed':
    case 'pending':
    case 'retry_wait':
    case 'running':
    case 'sending':
      return 'warn';
    default:
      return 'neutral';
  }
});
</script>
