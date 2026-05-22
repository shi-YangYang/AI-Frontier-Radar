<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink class="brand" to="/" :aria-label="t('brand.ariaLabel')">
        <BrandLogo :alt="t('brand.name')" />
        <span>
          <strong>
            <span class="brand-name-full">{{ t('brand.name') }}</span>
            <span class="brand-name-short">{{ t('brand.shortName') }}</span>
          </strong>
          <small>{{ t('brand.subtitle') }}</small>
        </span>
      </RouterLink>
      <nav class="nav-list" :aria-label="t('nav.overview')">
        <RouterLink v-for="item in navItems" :key="item.to" class="nav-item" :to="item.to">
          <span>{{ item.icon }}</span>
          {{ t(item.label) }}
        </RouterLink>
      </nav>
      <div class="sidebar-actions">
        <button class="language-button" type="button" @click="toggleLanguage">
          {{ t('language.switchTo') }}
        </button>
        <button
          class="menu-button"
          type="button"
          :aria-label="t('nav.openMenu')"
          :aria-expanded="isDrawerOpen"
          aria-controls="mobile-navigation-drawer"
          @click="openDrawer"
        >
          ☰
        </button>
      </div>
    </aside>
    <div
      v-if="isDrawerOpen"
      class="drawer-backdrop"
      aria-hidden="true"
      @click="closeDrawer"
    ></div>
    <aside
      id="mobile-navigation-drawer"
      class="mobile-drawer"
      :class="{ open: isDrawerOpen }"
      :aria-hidden="!isDrawerOpen"
      aria-modal="true"
      role="dialog"
      :aria-labelledby="'mobile-navigation-title'"
    >
      <header class="drawer-header">
        <div>
          <p id="mobile-navigation-title">{{ t('nav.drawerTitle') }}</p>
          <strong>{{ t('brand.name') }}</strong>
        </div>
        <button class="icon-button" type="button" :aria-label="t('nav.closeMenu')" @click="closeDrawer">
          ×
        </button>
      </header>
      <nav class="drawer-nav-list" :aria-label="t('nav.drawerTitle')">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          class="drawer-nav-item"
          :to="item.to"
          @click="closeDrawer"
        >
          <span>{{ item.icon }}</span>
          {{ t(item.label) }}
        </RouterLink>
      </nav>
    </aside>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

import BrandLogo from './components/BrandLogo.vue';
import { useI18n } from './i18n';

const { htmlLanguage, t, toggleLanguage } = useI18n();
const route = useRoute();
const isDrawerOpen = ref(false);

const navItems = [
  { icon: '⌂', label: 'nav.overview', to: '/' },
  { icon: '@', label: 'nav.accounts', to: '/accounts' },
  { icon: '↻', label: 'nav.pollRuns', to: '/poll-runs' },
  { icon: '✉', label: 'nav.posts', to: '/posts' },
  { icon: '→', label: 'nav.deliveryEvents', to: '/delivery-events' },
  { icon: '⚙', label: 'nav.settings', to: '/settings' },
] as const;

watchEffect(() => {
  document.documentElement.lang = htmlLanguage.value;
  document.title = t('brand.documentTitle');
});

watch(
  () => route.fullPath,
  () => {
    closeDrawer();
  },
);

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});

function openDrawer(): void {
  isDrawerOpen.value = true;
}

function closeDrawer(): void {
  isDrawerOpen.value = false;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeDrawer();
  }
}
</script>
