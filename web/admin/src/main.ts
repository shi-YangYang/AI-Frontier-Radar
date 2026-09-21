import { createApp } from 'vue';

import App from './App.vue';
import { resolveAuthProviders } from './auth';
import { router } from './router';

import './styles.css';
import './admin.css';
import './public.css';

// 等待首次路由解析（含登录守卫 /auth/me 校验）与登录方式预加载（钉钉入口）完成后再挂载：
// 首屏即为最终页面，避免未登录刷新闪现管理台、登录按钮二次渲染。
// 启动占位至少显示 500ms，避免加载过快时占位一闪而过反而造成闪烁。
const app = createApp(App).use(router);
const bootStartedAt = Date.now();
const MIN_BOOT_SPLASH_MS = 500;

void Promise.all([router.isReady(), resolveAuthProviders()]).then(() => {
  const remaining = MIN_BOOT_SPLASH_MS - (Date.now() - bootStartedAt);

  setTimeout(() => app.mount('#app'), Math.max(0, remaining));
});
