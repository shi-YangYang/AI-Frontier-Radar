import { createRouter, createWebHistory } from 'vue-router';

import { resolveAuthUser } from './auth';
import AccountsPage from './pages/AccountsPage.vue';
import LoginPage from './pages/LoginPage.vue';
import PortalPage from './pages/PortalPage.vue';
import DeliveryEventsPage from './pages/DeliveryEventsPage.vue';
import LogsPage from './pages/LogsPage.vue';
import OverviewPage from './pages/OverviewPage.vue';
import PollRunsPage from './pages/PollRunsPage.vue';
import PostsPage from './pages/PostsPage.vue';
import SettingsPage from './pages/SettingsPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      component: LoginPage,
      path: '/login',
    },
    {
      component: PortalPage,
      path: '/portal',
    },
    {
      component: OverviewPage,
      path: '/',
    },
    {
      component: AccountsPage,
      path: '/accounts',
    },
    {
      component: PollRunsPage,
      path: '/poll-runs',
    },
    {
      component: PostsPage,
      path: '/posts',
    },
    {
      component: DeliveryEventsPage,
      path: '/delivery-events',
    },
    {
      component: SettingsPage,
      path: '/settings',
    },
    {
      component: LogsPage,
      path: '/logs',
    },
  ],
});

router.beforeEach(async (to) => {
  const user = await resolveAuthUser();

  if (to.path === '/login') {
    if (user !== null) {
      return user.role === 'admin' ? '/' : '/portal';
    }

    return true;
  }

  if (user === null) {
    return {
      path: '/login',
      query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
    };
  }

  if (user.role !== 'admin' && to.path !== '/portal') {
    return '/portal';
  }

  return true;
});
