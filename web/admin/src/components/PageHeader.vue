<template>
  <div class="page-header">
    <div>
      <h1 v-if="title">{{ title }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  subtitle?: string;
  title?: string;
}>();
</script>
