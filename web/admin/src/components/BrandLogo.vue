<template>
  <img class="brand-logo" :class="'brand-logo-' + size" :src="logoSrc" :alt="alt" />
</template>

<script setup lang="ts">
const logoSrc = '/admin-assets/brand/logo-mark.png';

withDefaults(
  defineProps<{
    alt?: string;
    size?: 'default' | 'small';
  }>(),
  {
    alt: '',
    size: 'default',
  },
);
</script>
