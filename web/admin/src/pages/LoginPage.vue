<template>
  <div class="auth-shell">
    <div class="auth-topbar">
      <button class="language-button" type="button" @click="toggleLanguage">
        {{ t('language.switchTo') }}
      </button>
    </div>
    <section class="auth-card">
      <BrandLogo :alt="t('brand.name')" class="auth-logo" />
      <h1>{{ t('auth.loginTitle') }}</h1>
      <p class="muted">{{ t('auth.loginSubtitle') }}</p>

      <form class="auth-form" @submit.prevent="handleSubmit">
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
        <p v-if="errorMessage !== null" class="auth-error">{{ errorMessage }}</p>
        <button class="primary" type="submit" :disabled="busy">
          {{ busy ? t('auth.loggingIn') : t('auth.loginAction') }}
        </button>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { signIn } from '../auth';
import BrandLogo from '../components/BrandLogo.vue';
import { useI18n } from '../i18n';

const { t, toggleLanguage } = useI18n();
const route = useRoute();
const router = useRouter();
const busy = ref(false);
const errorMessage = ref<string | null>(null);
const password = ref('');
const username = ref('');

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
