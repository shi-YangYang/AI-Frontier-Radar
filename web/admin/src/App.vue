<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink class="brand" to="/">
        <span class="brand-mark">AI</span>
        <span>
          <strong>AI 前沿消息</strong>
          <small>Local Console</small>
        </span>
      </RouterLink>
      <nav class="nav-list" :aria-label="t('nav.overview')">
        <RouterLink v-for="item in navItems" :key="item.to" class="nav-item" :to="item.to">
          <span>{{ item.icon }}</span>
          {{ t(item.label) }}
        </RouterLink>
      </nav>
      <button class="language-button" type="button" @click="toggleLanguage">
        {{ t('language.switchTo') }}
      </button>
    </aside>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { watchEffect } from 'vue';

import { useI18n } from './i18n';

const { htmlLanguage, t, toggleLanguage } = useI18n();

const navItems = [
  { icon: '⌂', label: 'nav.overview', to: '/' },
  { icon: '@', label: 'nav.accounts', to: '/accounts' },
  { icon: '↻', label: 'nav.pollRuns', to: '/poll-runs' },
  { icon: '→', label: 'nav.deliveryEvents', to: '/delivery-events' },
] as const;

watchEffect(() => {
  document.documentElement.lang = htmlLanguage.value;
});
</script>
