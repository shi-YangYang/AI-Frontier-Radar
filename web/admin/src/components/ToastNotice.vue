<template>
  <p v-if="message.length > 0" class="notice" :class="{ danger }" role="status">
    {{ message }}
  </p>
</template>

<script setup lang="ts">
defineProps<{
  danger?: boolean;
  message: string;
}>();
</script>
