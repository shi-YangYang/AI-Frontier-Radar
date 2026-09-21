<template>
  <div class="auth-shell">
    <aside class="auth-brand">
      <div class="auth-brand-decor" aria-hidden="true"></div>
      <div class="auth-brand-grid" aria-hidden="true"></div>
      <div class="auth-brand-inner">
        <div class="auth-brand-head">
          <BrandLogo :alt="t('brand.name')" class="auth-brand-logo" />
          <div>
            <strong>{{ t('brand.name') }}</strong>
            <small>{{ t('brand.subtitle') }}</small>
          </div>
        </div>
        <div class="auth-brand-story">
          <h1>{{ t('auth.brandHeadline') }}</h1>
          <ul class="auth-brand-points">
            <li>{{ t('auth.pointSources') }}</li>
            <li>{{ t('auth.pointLocal') }}</li>
            <li>{{ t('auth.pointWechat') }}</li>
          </ul>
        </div>
      </div>
    </aside>

    <div class="auth-topbar">
      <button class="language-button" type="button" @click="toggleLanguage">
        {{ t('language.switchTo') }}
      </button>
    </div>

    <main class="auth-main">
      <form class="auth-form-card" @submit.prevent="handleSubmit">
        <header>
          <h2>{{ t('auth.loginTitle') }}</h2>
          <p>{{ t('auth.loginSubtitle') }}</p>
        </header>

        <p v-if="resetNotice" class="auth-notice" role="status">{{ t('auth.passwordResetNotice') }}</p>
        <label>
          <span>{{ t('auth.username') }}</span>
          <input
            v-model="username"
            autocomplete="username"
            :disabled="busy"
            :placeholder="t('auth.usernamePlaceholder')"
          />
        </label>
        <label>
          <span>{{ t('auth.password') }}</span>
          <input
            v-model="password"
            autocomplete="current-password"
            :disabled="busy"
            type="password"
            :placeholder="t('auth.passwordPlaceholder')"
          />
        </label>
        <p v-if="errorMessage !== null" class="auth-error" role="alert">{{ errorMessage }}</p>
        <button class="primary" type="submit" :disabled="busy">
          {{ busy ? t('auth.loggingIn') : t('auth.loginAction') }}
        </button>

        <template v-if="dingtalkEnabled">
          <div class="auth-divider" role="separator" :aria-label="t('auth.dingtalkDivider')">
            <span class="auth-divider-line" aria-hidden="true"></span>
            <span class="auth-divider-text">{{ t('auth.dingtalkDivider') }}</span>
            <span class="auth-divider-line" aria-hidden="true"></span>
          </div>
          <a class="dingtalk-login-button" href="/auth/dingtalk/start">
            <svg
              aria-hidden="true"
              class="dingtalk-login-button-logo"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10s10-4.477 10-10S17.523 2 12 2m4.49 9.04l-.006.014c-.42.898-1.516 2.66-1.516 2.66l-.005-.012l-.32.558h1.543l-2.948 3.919l.67-2.666h-1.215l.422-1.763a17 17 0 0 0-1.223.349s-.646.378-1.862-.729c0 0-.82-.722-.344-.902c.202-.077.981-.175 1.595-.257a80 80 0 0 1 1.338-.172s-2.555.039-3.161-.057c-.606-.095-1.375-1.107-1.539-1.996c0 0-.253-.488.545-.257s4.101.9 4.101.9S8.27 9.312 7.983 8.99c-.286-.32-.841-1.754-.769-2.634c0 0 .031-.22.257-.16c0 0 3.176 1.45 5.347 2.245s4.06 1.199 3.816 2.228c-.02.087-.072.216-.144.37"
              />
            </svg>
            <span>{{ t('auth.dingtalkAction') }}</span>
          </a>
        </template>
      </form>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { resolveAuthProviders, signIn, useAuth } from '../auth';
import BrandLogo from '../components/BrandLogo.vue';
import { useI18n } from '../i18n';

const { htmlLanguage, t, toggleLanguage } = useI18n();
const { authProviders } = useAuth();
const route = useRoute();
const router = useRouter();
const busy = ref(false);
const errorMessage = ref<string | null>(null);
const password = ref('');
const username = ref('');
const resetNotice = route.query.reset === '1';
const dingtalkEnabled = computed(() => authProviders.value?.dingtalk.enabled === true);

onMounted(() => {
  resolveErrorNotice();
  void resolveAuthProviders(true);
});

function resolveErrorNotice(): void {
  const error = typeof route.query.error === 'string' ? route.query.error : '';

  if (error.length === 0) {
    return;
  }

  errorMessage.value =
    error === 'dingtalk_disabled' ? t('auth.dingtalkErrorDisabled') : t('auth.dingtalkErrorGeneric');
}

async function handleSubmit(): Promise<void> {
  errorMessage.value = null;

  if (username.value.trim().length === 0 || password.value.length === 0) {
    errorMessage.value = t('auth.errorEmpty');

    return;
  }

  busy.value = true;

  try {
    const user = await signIn(username.value.trim(), password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null;

    if (user.role === 'admin') {
      await router.push(redirect ?? '/');
    } else {
      await router.push('/portal');
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.errorFailed');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.auth-divider {
  align-items: center;
  color: var(--muted);
  display: flex;
  font-size: 12px;
  gap: 12px;
  margin: 2px 0;
}

.auth-divider-line {
  background: var(--border);
  flex: 1;
  height: 1px;
}

.dingtalk-login-button {
  align-items: center;
  background: #0089ff;
  border: 1px solid #0089ff;
  border-radius: 8px;
  color: #ffffff;
  display: flex;
  font-size: 14px;
  font-weight: 550;
  gap: 8px;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  text-decoration: none;
  transition:
    background 120ms ease,
    border-color 120ms ease;
}

.dingtalk-login-button:hover {
  background: #0076e3;
  border-color: #0076e3;
  color: #ffffff;
}

.dingtalk-login-button-logo {
  flex: 0 0 auto;
  height: 18px;
  width: 18px;
}
</style>
