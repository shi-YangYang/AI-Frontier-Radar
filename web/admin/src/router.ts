import { createRouter, createWebHistory } from 'vue-router';

import AccountsPage from './pages/AccountsPage.vue';
import DeliveryEventsPage from './pages/DeliveryEventsPage.vue';
import OverviewPage from './pages/OverviewPage.vue';
import PollRunsPage from './pages/PollRunsPage.vue';
import PostsPage from './pages/PostsPage.vue';
import SettingsPage from './pages/SettingsPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
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
  ],
});
