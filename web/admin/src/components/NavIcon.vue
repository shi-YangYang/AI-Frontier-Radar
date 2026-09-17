<script setup lang="ts">
defineProps<{
  name: 'accounts' | 'delivery' | 'home' | 'logs' | 'poll' | 'posts' | 'settings';
}>();
</script>

<template>
  <svg
    class="nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'home'">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H9.5v-5.5h5V21h3a1 1 0 0 0 1-1V9.5" />
    </template>
    <template v-else-if="name === 'accounts'">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20.5c0-3.6 3.4-5.5 7.5-5.5s7.5 1.9 7.5 5.5" />
    </template>
    <template v-else-if="name === 'poll'">
      <path d="M22 12h-4l-3 7-4-14-3 7H2" />
    </template>
    <template v-else-if="name === 'posts'">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </template>
    <template v-else-if="name === 'delivery'">
      <path d="M21.5 2.5 11 13" />
      <path d="M21.5 2.5 15 21l-4-8-8-4z" />
    </template>
    <template v-else-if="name === 'logs'">
      <path d="M5 3.5h9.5L19 8v12.5H5z" />
      <path d="M14 3.5V8h5" />
      <path d="M8 12h8" />
      <path d="M8 15.5h8" />
    </template>
    <template v-else>
      <line x1="4" y1="8" x2="20" y2="8" />
      <circle cx="9.5" cy="8" r="2" fill="currentColor" stroke="none" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="14.5" cy="16" r="2" fill="currentColor" stroke="none" />
    </template>
  </svg>
</template>
