<template>
  <RouterView v-if="isBareRoute" />
  <div v-else class="app-shell">
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
          <NavIcon :name="item.icon" />
          {{ t(item.label) }}
        </RouterLink>
      </nav>
      <div class="sidebar-user" v-if="currentUser !== null">
        <div class="sidebar-user-head">
          <div class="sidebar-user-info">
            <strong>{{ currentUser.username }}</strong>
            <small>{{ currentUser.role === 'admin' ? t('auth.roleAdmin') : t('auth.roleUser') }}</small>
          </div>
        </div>
        <button class="logout-button" type="button" @click="handleLogout">
          {{ t('auth.logout') }}
        </button>
      </div>
      <div class="sidebar-actions">
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
          <NavIcon :name="item.icon" />
          {{ t(item.label) }}
        </RouterLink>
      </nav>
      <div class="drawer-user" v-if="currentUser !== null">
        <strong>{{ currentUser.username }}</strong>
        <button class="language-button" type="button" @click="handleLogout">
          {{ t('auth.logout') }}
        </button>
      </div>
    </aside>
    <main class="content">
      <header class="content-topbar">
        <nav class="breadcrumb" :aria-label="t('nav.breadcrumb')">
          <RouterLink to="/">{{ t('nav.home') }}</RouterLink>
          <span class="breadcrumb-sep" aria-hidden="true">/</span>
          <span class="breadcrumb-current">{{ t(breadcrumbLabel) }}</span>
        </nav>
        <button class="language-button" type="button" @click="toggleLanguage">
          {{ t('language.switchTo') }}
        </button>
      </header>
      <div class="content-body">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { signOut, useAuth } from './auth';
import BrandLogo from './components/BrandLogo.vue';
import NavIcon from './components/NavIcon.vue';
import { useI18n, type MessageKey } from './i18n';

const { htmlLanguage, t, toggleLanguage } = useI18n();
const { currentUser } = useAuth();
const route = useRoute();
const router = useRouter();
const isDrawerOpen = ref(false);
const isBareRoute = computed(() => route.path === '/login' || route.path === '/portal');
const breadcrumbLabel = computed<MessageKey>(
  () => (route.meta.labelKey as MessageKey | undefined) ?? 'nav.overview',
);

const navItems = [
  { icon: 'home', label: 'nav.overview', to: '/' },
  { icon: 'accounts', label: 'nav.accounts', to: '/accounts' },
  { icon: 'poll', label: 'nav.pollRuns', to: '/poll-runs' },
  { icon: 'posts', label: 'nav.posts', to: '/posts' },
  { icon: 'delivery', label: 'nav.deliveryEvents', to: '/delivery-events' },
  { icon: 'logs', label: 'nav.logs', to: '/logs' },
  { icon: 'settings', label: 'nav.settings', to: '/settings' },
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
  window.addEventListener('auth:expired', handleAuthExpired);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('auth:expired', handleAuthExpired);
});

function handleAuthExpired(): void {
  void router.push({ path: '/login', query: { redirect: route.fullPath } });
}

async function handleLogout(): Promise<void> {
  await signOut();
  await router.push('/login');
}

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
