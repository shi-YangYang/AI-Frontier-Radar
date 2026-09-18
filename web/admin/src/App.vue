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
        <template v-for="item in navItems" :key="item.to">
          <RouterLink
            class="nav-item"
            :to="item.to"
            @click="item.to === '/settings' ? toggleSettingsMenu($event) : undefined"
          >
            <NavIcon :name="item.icon" />
            {{ t(item.label) }}
            <span
              v-if="item.to === '/settings'"
              class="nav-chevron"
              :class="{ open: settingsMenuOpen }"
              aria-hidden="true"
            ></span>
          </RouterLink>
          <div v-if="item.to === '/settings' && settingsMenuOpen" class="nav-sub-list">
            <RouterLink
              v-for="tab in settingsNavTabs"
              :key="tab.key"
              class="nav-sub-item"
              :class="{ active: activeSettingsTabKey === tab.key }"
              :title="t(tab.descriptionKey)"
              :to="{ path: '/settings', query: { tab: tab.key } }"
            >
              {{ t(tab.labelKey) }}
            </RouterLink>
          </div>
        </template>
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
        <template v-for="item in navItems" :key="item.to">
          <RouterLink
            class="drawer-nav-item"
            :to="item.to"
            @click="item.to === '/settings' ? toggleSettingsMenu($event, true) : closeDrawer()"
          >
            <NavIcon :name="item.icon" />
            {{ t(item.label) }}
            <span
              v-if="item.to === '/settings'"
              class="nav-chevron"
              :class="{ open: settingsMenuOpen }"
              aria-hidden="true"
            ></span>
          </RouterLink>
          <div v-if="item.to === '/settings' && settingsMenuOpen" class="drawer-nav-sub-list">
            <RouterLink
              v-for="tab in settingsNavTabs"
              :key="tab.key"
              class="drawer-nav-sub-item"
              :class="{ active: activeSettingsTabKey === tab.key }"
              :to="{ path: '/settings', query: { tab: tab.key } }"
              @click="closeDrawer"
            >
              {{ t(tab.labelKey) }}
            </RouterLink>
          </div>
        </template>
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

const settingsNavTabs: Array<{ descriptionKey: MessageKey; key: string; labelKey: MessageKey }> = [
  {
    descriptionKey: 'settings.tabs.feishu.description',
    key: 'feishu',
    labelKey: 'settings.tabs.feishu.label',
  },
  {
    descriptionKey: 'settings.tabs.polling.description',
    key: 'polling',
    labelKey: 'settings.tabs.polling.label',
  },
  {
    descriptionKey: 'settings.tabs.xSource.description',
    key: 'xSource',
    labelKey: 'settings.tabs.xSource.label',
  },
  {
    descriptionKey: 'settings.tabs.rss.description',
    key: 'rss',
    labelKey: 'settings.tabs.rss.label',
  },
  {
    descriptionKey: 'settings.tabs.rules.description',
    key: 'rules',
    labelKey: 'settings.tabs.rules.label',
  },
  {
    descriptionKey: 'settings.tabs.wechat.description',
    key: 'wechat',
    labelKey: 'settings.tabs.wechat.label',
  },
  {
    descriptionKey: 'settings.tabs.data.description',
    key: 'data',
    labelKey: 'settings.tabs.data.label',
  },
  {
    descriptionKey: 'settings.tabs.users.description',
    key: 'users',
    labelKey: 'settings.tabs.users.label',
  },
  {
    descriptionKey: 'settings.tabs.runtime.description',
    key: 'runtime',
    labelKey: 'settings.tabs.runtime.label',
  },
];

const isSettingsRoute = computed(() => route.path === '/settings');
const settingsMenuOpen = ref(isSettingsRoute.value);
const settingsTabKeys = settingsNavTabs.map((tab) => tab.key);
const activeSettingsTabKey = computed(() => {
  const queryTab = typeof route.query.tab === 'string' ? route.query.tab : '';

  return settingsTabKeys.includes(queryTab) ? queryTab : 'feishu';
});

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

watch(isSettingsRoute, (onSettings) => {
  settingsMenuOpen.value = onSettings;
});

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

function toggleSettingsMenu(event: MouseEvent, fromDrawer = false): void {
  if (settingsMenuOpen.value) {
    event.preventDefault();
    settingsMenuOpen.value = false;

    return;
  }

  settingsMenuOpen.value = true;

  if (fromDrawer && !isSettingsRoute.value) {
    closeDrawer();
  }
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
