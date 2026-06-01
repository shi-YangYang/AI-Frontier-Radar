<template>
  <section>
    <PageHeader :title="t('settings.title')" :subtitle="t('settings.subtitle')">
      <div class="toolbar">
        <button type="button" :disabled="busy" @click="() => loadSettings()">{{ t('actions.refresh') }}</button>
      </div>
    </PageHeader>

    <ToastNotice :message="notice" :danger="noticeDanger" />

    <div v-if="settings === null" class="panel">
      <div class="empty-panel">{{ t('settings.loading') }}</div>
    </div>

    <div v-else class="settings-shell">
      <nav class="settings-tabs" :aria-label="t('settings.tabsAria')">
        <button
          v-for="tab in settingsTabs"
          :key="tab.key"
          type="button"
          class="settings-tab"
          :class="{ active: activeSettingsTab === tab.key }"
          :aria-current="activeSettingsTab === tab.key ? 'page' : undefined"
          @click="activeSettingsTab = tab.key"
        >
          <span>{{ t(tab.labelKey) }}</span>
          <small>{{ t(tab.descriptionKey) }}</small>
        </button>
      </nav>

      <div class="settings-tab-panel">
        <section v-if="activeSettingsTab === 'feishu'" class="settings-layout single-column">
          <article class="panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.feishu.addTitle') }}</h2>
                <p>{{ t('settings.feishu.addDescription') }}</p>
              </div>
            </header>

            <form class="settings-form delivery-target-form" @submit.prevent="createTarget">
              <label>
                <span>{{ t('settings.feishu.displayNameLabel') }}</span>
                <input
                  v-model="newTargetForm.displayName"
                  autocomplete="off"
                  maxlength="100"
                  :placeholder="t('settings.feishu.displayNamePlaceholder')"
                />
              </label>
              <label>
                <span>{{ t('settings.feishu.urlLabel') }}</span>
                <input
                  v-model="newTargetForm.webhookUrl"
                  autocomplete="off"
                  placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                  type="url"
                />
              </label>
              <label class="checkbox-row compact-checkbox">
                <input v-model="newTargetForm.enabled" type="checkbox" />
                <span>{{ t('settings.feishu.enableOnCreate') }}</span>
              </label>
              <div class="form-actions">
                <button class="primary" type="submit" :disabled="busy">{{ t('settings.feishu.submitAdd') }}</button>
              </div>
            </form>
          </article>

          <article class="panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.feishu.listTitle') }}</h2>
                <p>{{ t('settings.feishu.listDescription') }}</p>
              </div>
              <span class="muted">
                {{ t('settings.feishu.enabledSummary', { enabled: deliveryTargetSummary.enabled, total: deliveryTargetSummary.total }) }}
              </span>
            </header>

            <div class="table-wrap">
              <table class="delivery-target-table">
                <thead>
                  <tr>
                    <th>{{ t('settings.feishu.displayNameLabel') }}</th>
                    <th>targetKey</th>
                    <th>{{ t('settings.feishu.table.enabled') }}</th>
                    <th>{{ t('settings.feishu.table.preview') }}</th>
                    <th>{{ t('table.createdAt') }}</th>
                    <th>{{ t('table.updatedAt') }}</th>
                    <th>{{ t('table.actions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="deliveryTargets.length === 0">
                    <td colspan="7" class="empty-cell">{{ t('settings.feishu.empty') }}</td>
                  </tr>
                  <tr v-for="target in deliveryTargets" :key="target.id">
                    <td>
                      <strong>{{ target.displayName }}</strong>
                    </td>
                    <td><code>{{ target.targetKey }}</code></td>
                    <td>
                      <span class="status-badge" :class="target.enabled ? 'good' : 'neutral'">
                        {{ target.enabled ? t('settings.status.enabled') : t('settings.status.disabled') }}
                      </span>
                    </td>
                    <td><code class="wrap">{{ target.webhookPreview }}</code></td>
                    <td>{{ formatDateTime(target.createdAt) }}</td>
                    <td>{{ formatDateTime(target.updatedAt) }}</td>
                    <td>
                      <div class="target-actions">
                        <button type="button" :disabled="busy" @click="openEditTarget(target)">{{ t('actions.edit') }}</button>
                        <button type="button" :disabled="busy" @click="toggleTargetEnabled(target)">
                          {{ target.enabled ? t('actions.disable') : t('actions.enable') }}
                        </button>
                        <button type="button" :disabled="busy" @click="testTarget(target)">{{ t('actions.testSend') }}</button>
                        <button class="danger" type="button" :disabled="busy" @click="askDeleteTarget(target)">
                          {{ t('actions.delete') }}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <PaginationBar
              :busy="busy"
              :pagination="deliveryTargetPagination"
              @change-page="loadDeliveryTargetPage"
              @invalid-page="setNotice(t('notice.invalidPage'), true)"
            />
          </article>
        </section>

        <section v-else-if="activeSettingsTab === 'polling'" class="settings-layout single-column">
          <article class="panel settings-form-panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.polling.title') }}</h2>
                <p>{{ t('settings.polling.description') }}</p>
              </div>
            </header>
            <form class="settings-form polling-form" @submit.prevent="savePolling">
              <label>
                <span>{{ t('settings.polling.intervalSeconds') }}</span>
                <input
                  v-model.number="pollingForm.intervalSeconds"
                  inputmode="numeric"
                  max="3600"
                  min="10"
                  type="number"
                />
                <small>
                  {{ t('settings.polling.rangeSeconds', { source: sourceLabel(settings.polling.sources.intervalSeconds) }) }}
                </small>
              </label>

              <label>
                <span>{{ t('settings.polling.fetchLimitPerAccount') }}</span>
                <input
                  v-model.number="pollingForm.fetchLimitPerAccount"
                  inputmode="numeric"
                  max="100"
                  min="1"
                  type="number"
                />
                <small>
                  {{ t('settings.polling.rangeItems', { source: sourceLabel(settings.polling.sources.fetchLimitPerAccount) }) }}
                </small>
              </label>

              <label class="checkbox-row">
                <input v-model="pollingForm.excludeReplies" type="checkbox" />
                <span>{{ t('settings.polling.excludeReplies') }}</span>
                <small>
                  {{ t('settings.polling.currentSource', { source: sourceLabel(settings.polling.sources.excludeReplies) }) }}
                </small>
              </label>

              <label class="checkbox-row">
                <input v-model="pollingForm.excludeReposts" type="checkbox" />
                <span>{{ t('settings.polling.excludeReposts') }}</span>
                <small>
                  {{ t('settings.polling.currentSource', { source: sourceLabel(settings.polling.sources.excludeReposts) }) }}
                </small>
              </label>

              <div class="form-actions">
                <button class="primary" type="submit" :disabled="busy">{{ t('settings.polling.save') }}</button>
              </div>
            </form>
          </article>
        </section>

        <section v-else-if="activeSettingsTab === 'xSource'" class="settings-layout x-source-layout">
          <article class="panel settings-wide">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.xSource.summaryTitle') }}</h2>
                <p>{{ t('settings.xSource.summaryDescription') }}</p>
              </div>
              <span
                v-if="xSourceSettings !== null"
                class="status-badge"
                :class="xSourceSettings.mode === 'browser' ? 'good' : 'neutral'"
              >
                {{ xSourceSettings.mode }}
              </span>
            </header>

            <div v-if="xSourceSettings === null" class="empty-panel">{{ t('settings.loading') }}</div>
            <dl v-else class="detail-list x-source-detail-list">
              <div>
                <dt>{{ t('settings.xSource.mode') }}</dt>
                <dd><code>{{ xSourceSettings.mode }}</code></dd>
              </div>
              <div>
                <dt>{{ t('settings.xSource.baseUrl') }}</dt>
                <dd><code class="wrap">{{ xSourceSettings.browser.baseUrl }}</code></dd>
              </div>
              <div>
                <dt>{{ t('settings.xSource.profileDir') }}</dt>
                <dd><code class="wrap">{{ xSourceSettings.browser.userDataDir }}</code></dd>
              </div>
              <div>
                <dt>{{ t('settings.xSource.headless') }}</dt>
                <dd>
                  <span class="status-badge" :class="xSourceSettings.browser.headless ? 'neutral' : 'good'">
                    {{
                      xSourceSettings.browser.headless
                        ? t('settings.xSource.headlessEnabled')
                        : t('settings.xSource.headlessDisabled')
                    }}
                  </span>
                </dd>
              </div>
              <div>
                <dt>{{ t('settings.xSource.proxyPreview') }}</dt>
                <dd>
                  <code class="wrap">
                    {{
                      xSourceSettings.browser.proxyPreview
                        ?? t('settings.xSource.proxyNotConfigured')
                    }}
                  </code>
                  <span class="muted">
                    ({{ sourceLabel(xSourceSettings.browser.proxySource) }})
                  </span>
                </dd>
              </div>
            </dl>
          </article>

          <article class="panel settings-form-panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.xSource.proxyTitle') }}</h2>
                <p>{{ t('settings.xSource.proxyDescription') }}</p>
              </div>
            </header>

            <form class="settings-form x-source-form" @submit.prevent="saveXProxy">
              <label>
                <span>{{ t('settings.xSource.proxyUrlLabel') }}</span>
                <input
                  v-model="xProxyForm.proxyUrl"
                  autocomplete="off"
                  inputmode="url"
                  :placeholder="t('settings.xSource.proxyUrlPlaceholder')"
                />
                <small>{{ t('settings.xSource.proxyHelp') }}</small>
                <div class="x-source-current-url">
                  <span>{{ t('settings.xSource.currentProxyUrl') }}</span>
                  <code class="wrap">
                    {{
                      xSourceSettings?.browser.proxyPreview
                        ?? t('settings.xSource.proxyNotConfigured')
                    }}
                  </code>
                </div>
              </label>
              <div class="inline-alert">
                {{ t('settings.xSource.proxySecurityHint') }}
              </div>
              <div class="form-actions x-source-actions">
                <button class="primary" type="submit" :disabled="busy || !isBrowserSourceMode()">
                  {{ t('settings.xSource.saveProxy') }}
                </button>
                <button type="button" :disabled="busy || !isBrowserSourceMode()" @click="clearXProxy">
                  {{ t('settings.xSource.clearProxy') }}
                </button>
              </div>
            </form>
          </article>

          <article class="panel settings-form-panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.xSource.anonymousTitle') }}</h2>
                <p>{{ t('settings.xSource.anonymousDescription') }}</p>
              </div>
            </header>

            <form class="settings-form x-source-form" @submit.prevent="runAnonymousTest">
              <label>
                <span>{{ t('settings.xSource.testUsernameLabel') }}</span>
                <input
                  v-model="xDiagnosticUsername"
                  autocomplete="off"
                  :placeholder="t('settings.xSource.testUsernamePlaceholder')"
                />
              </label>
              <div class="form-actions x-source-actions">
                <button class="primary" type="submit" :disabled="busy || !isBrowserSourceMode()">
                  {{ t('settings.xSource.runAnonymousTest') }}
                </button>
              </div>
            </form>

            <section
              v-if="anonymousCheckResult !== null"
              class="x-source-result"
              :aria-label="t('settings.xSource.anonymousResultAria')"
            >
              <span class="status-badge" :class="anonymousStatusClass(anonymousCheckResult.status)">
                {{ t(anonymousStatusLabelKey(anonymousCheckResult.status)) }}
              </span>
              <p>
                {{
                  t(anonymousStatusDetailKey(anonymousCheckResult.status), {
                    xUsername: '@' + anonymousCheckResult.xUsername,
                  })
                }}
              </p>
              <small v-if="anonymousCheckResult.sourceCode !== undefined">
                sourceCode=<code>{{ anonymousCheckResult.sourceCode }}</code>
              </small>
            </section>
          </article>

          <article class="panel settings-form-panel settings-wide">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.xSource.loginTitle') }}</h2>
                <p>{{ t('settings.xSource.loginDescription') }}</p>
              </div>
            </header>

            <div class="settings-form x-source-form">
              <div v-if="!isBrowserSourceMode()" class="inline-alert warn">
                {{ t('settings.xSource.browserModeRequired') }}
              </div>
              <div class="inline-alert warn">
                {{ t('settings.xSource.noGuiHint') }}
              </div>
              <div class="form-actions x-source-actions">
                <button type="button" :disabled="busy || !isBrowserSourceMode()" @click="runLoginCheck">
                  {{ t('settings.xSource.checkLogin') }}
                </button>
                <button class="primary" type="button" :disabled="busy || !isBrowserSourceMode()" @click="openLoginWindow">
                  {{ t('settings.xSource.openLoginWindow') }}
                </button>
              </div>
            </div>

            <section
              v-if="loginCheckResult !== null"
              class="x-source-result"
              :aria-label="t('settings.xSource.loginResultAria')"
            >
              <span class="status-badge" :class="loginStatusClass(loginCheckResult.status)">
                {{ t(loginStatusLabelKey(loginCheckResult.status)) }}
              </span>
              <p>
                {{
                  t(loginStatusDetailKey(loginCheckResult.status), {
                    xUsername: '@' + loginCheckResult.xUsername,
                  })
                }}
              </p>
              <small v-if="loginCheckResult.sourceCode !== undefined">
                sourceCode=<code>{{ loginCheckResult.sourceCode }}</code>
              </small>
            </section>
          </article>
        </section>

        <section v-else class="settings-layout single-column">
          <article class="panel settings-form-panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.runtime.title') }}</h2>
                <p>{{ t('settings.runtime.description') }}</p>
              </div>
            </header>
            <dl class="detail-list">
              <div>
                <dt>{{ t('settings.runtime.sourceMode') }}</dt>
                <dd><code>{{ settings.readonly.sourceMode }}</code></dd>
              </div>
              <div>
                <dt>{{ t('settings.runtime.sqlitePath') }}</dt>
                <dd><code class="wrap">{{ settings.readonly.sqlitePath }}</code></dd>
              </div>
              <div>
                <dt>{{ t('settings.runtime.redisUrl') }}</dt>
                <dd>
                  <code class="wrap">{{ settings.readonly.redisUrlPreview ?? t('settings.runtime.notConfigured') }}</code>
                  <span class="muted">
                    ({{ settings.readonly.redisConfigured ? t('settings.runtime.configured') : t('settings.runtime.notConfigured') }})
                  </span>
                </dd>
              </div>
              <div>
                <dt>{{ t('settings.runtime.service') }}</dt>
                <dd>
                  <code>{{ settings.readonly.serviceHost }}:{{ settings.readonly.servicePort }}</code>
                  <span class="muted"> / {{ settings.readonly.serviceEnv }}</span>
                </dd>
              </div>
              <div>
                <dt>{{ t('settings.runtime.xConfigSummary') }}</dt>
                <dd v-if="settings.readonly.sourceMode === 'browser'">
                  <code class="wrap">
                    {{
                      t('settings.runtime.xBrowserSummary', {
                        baseUrl: settings.readonly.xBrowserBaseUrl,
                        headless: settings.readonly.xBrowserHeadless ? 'true' : 'false',
                        userDataDir: settings.readonly.xBrowserUserDataDir,
                      })
                    }}
                  </code>
                </dd>
                <dd v-else>
                  <code class="wrap">{{ t('settings.runtime.xApiSummary') }}</code>
                </dd>
              </div>
            </dl>
          </article>
        </section>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="editingTarget !== null" class="modal-backdrop" @click.self="closeEditTarget">
        <section class="modal wide target-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-target-title">
          <header class="modal-header">
            <div>
              <h2 id="edit-target-title">{{ t('settings.edit.title') }}</h2>
              <p>{{ t('settings.edit.description') }}</p>
            </div>
            <button class="icon-button" type="button" :aria-label="t('actions.close')" @click="closeEditTarget">×</button>
          </header>
          <form class="target-edit-form" @submit.prevent="saveTargetEdit">
            <div class="modal-body target-edit-body">
              <div class="settings-form modal-body-form">
                <label>
                  <span>{{ t('settings.feishu.displayNameLabel') }}</span>
                  <input
                    v-model="editTargetForm.displayName"
                    autocomplete="off"
                    maxlength="100"
                    :placeholder="t('settings.feishu.displayNamePlaceholder')"
                  />
                </label>
                <label>
                  <span>{{ t('settings.edit.newWebhookUrlLabel') }}</span>
                  <input
                    v-model="editTargetForm.webhookUrl"
                    autocomplete="off"
                    :placeholder="t('settings.edit.newWebhookUrlPlaceholder')"
                    type="url"
                  />
                  <small>{{ t('settings.edit.saveHelp') }}</small>
                </label>
              </div>

              <section class="target-preview-panel" :aria-label="t('settings.edit.currentInfoAria')">
                <h3>{{ t('settings.edit.currentInfo') }}</h3>
                <dl class="compact-detail-list">
                  <div>
                    <dt>{{ t('settings.edit.currentPreview') }}</dt>
                    <dd><code class="wrap">{{ editingTarget.webhookPreview }}</code></dd>
                  </div>
                  <div>
                    <dt>targetKey</dt>
                    <dd><code class="wrap">{{ editingTarget.targetKey }}</code></dd>
                  </div>
                </dl>
              </section>
            </div>
            <footer class="modal-footer">
              <button type="button" :disabled="busy" @click="closeEditTarget">{{ t('actions.cancel') }}</button>
              <button class="primary" type="submit" :disabled="busy">{{ t('actions.saveEdit') }}</button>
            </footer>
          </form>
        </section>
      </div>
    </Teleport>

    <ConfirmModal
      :open="deleteTarget !== null"
      :title="t('settings.delete.title')"
      :body="deleteTarget === null ? '' : deleteTarget.displayName"
      :detail="t('settings.delete.detail')"
      @cancel="deleteTarget = null"
      @confirm="confirmDeleteTarget"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import {
  AdminApiRequestError,
  checkXSourceLogin,
  createDeliveryTarget,
  deleteDeliveryTarget,
  getSettings,
  getXSourceSettings,
  listDeliveryTargets,
  openXLoginWindow,
  testDeliveryTarget,
  testXSourceAnonymous,
  updateDeliveryTarget,
  updateDeliveryTargetEnabled,
  updateXBrowserSettings,
  updatePollingSettings,
  type AdminPagination,
  type DeliveryTarget,
  type DeliveryTargetSummary,
  type RuntimeSettingSource,
  type RuntimeSettingsSummary,
  type RuntimeXSourceSettings,
  type XSourceAnonymousCheckResult,
  type XSourceAnonymousCheckStatus,
  type XSourceLoginCheckResult,
  type XSourceLoginCheckStatus,
} from '../api/admin-api';
import ConfirmModal from '../components/ConfirmModal.vue';
import PageHeader from '../components/PageHeader.vue';
import PaginationBar from '../components/PaginationBar.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t, type MessageKey } from '../i18n';
import { DEFAULT_PAGE_SIZE, formatDateTime } from '../utils';

const busy = ref(false);
const deleteTarget = ref<DeliveryTarget | null>(null);
const deliveryTargetPagination = ref<AdminPagination>({
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 0,
});
const deliveryTargetSummary = ref<DeliveryTargetSummary>({
  enabled: 0,
  total: 0,
});
const deliveryTargets = ref<DeliveryTarget[]>([]);
const editingTarget = ref<DeliveryTarget | null>(null);
const notice = ref('');
const noticeDanger = ref(false);
const settings = ref<RuntimeSettingsSummary | null>(null);
const xSourceSettings = ref<RuntimeXSourceSettings | null>(null);
const anonymousCheckResult = ref<XSourceAnonymousCheckResult | null>(null);
const loginCheckResult = ref<XSourceLoginCheckResult | null>(null);

type SettingsTabKey = 'feishu' | 'polling' | 'xSource' | 'runtime';

const activeSettingsTab = ref<SettingsTabKey>('feishu');
const settingsTabs: Array<{ descriptionKey: MessageKey; key: SettingsTabKey; labelKey: MessageKey }> = [
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
    descriptionKey: 'settings.tabs.runtime.description',
    key: 'runtime',
    labelKey: 'settings.tabs.runtime.label',
  },
];

const pollingForm = reactive({
  excludeReplies: true,
  excludeReposts: true,
  fetchLimitPerAccount: 5,
  intervalSeconds: 300,
});

const newTargetForm = reactive({
  displayName: '',
  enabled: true,
  webhookUrl: '',
});

const editTargetForm = reactive({
  displayName: '',
  webhookUrl: '',
});

const xProxyForm = reactive({
  proxyUrl: '',
});

const xDiagnosticUsername = ref('openai');

onMounted(() => {
  void loadSettings({ silent: true });
});

async function loadSettings(options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    const [loadedSettings, loadedXSourceSettings, loadedTargets] = await Promise.all([
      getSettings(),
      getXSourceSettings(),
      listDeliveryTargets(toDeliveryTargetQuery(deliveryTargetPagination.value.page)),
    ]);
    applySettings(loadedSettings);
    applyXSourceSettings(loadedXSourceSettings);
    applyDeliveryTargets(loadedTargets);

    if (options.silent !== true) {
      setNotice(t('settings.notice.refreshSuccess'));
    }
  } catch (error) {
    setNotice(t('settings.notice.refreshFailure', { error: toErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function loadDeliveryTargetPage(page: number): Promise<void> {
  await loadDeliveryTargets(page);
}

async function loadDeliveryTargets(page: number, options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    const result = await listDeliveryTargets(toDeliveryTargetQuery(page));
    applyDeliveryTargets(result);

    if (options.silent !== true) {
      setNotice(t('settings.notice.refreshSuccess'));
    }
  } catch (error) {
    setNotice(t('settings.notice.refreshFailure', { error: toErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function savePolling(): Promise<void> {
  const validationError = validatePollingForm();

  if (validationError !== null) {
    setNotice(t('settings.notice.savePollingFailure', { error: validationError }), true);
    return;
  }

  busy.value = true;

  try {
    const polling = await updatePollingSettings({
      excludeReplies: pollingForm.excludeReplies,
      excludeReposts: pollingForm.excludeReposts,
      fetchLimitPerAccount: pollingForm.fetchLimitPerAccount,
      intervalSeconds: pollingForm.intervalSeconds,
    });

    if (settings.value !== null) {
      settings.value = {
        ...settings.value,
        polling,
      };
    }

    setNotice(t('settings.notice.savePollingSuccess'));
  } catch (error) {
    setNotice(t('settings.notice.savePollingFailure', { error: toErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function saveXProxy(): Promise<void> {
  const validationError = validateXProxyUrl(xProxyForm.proxyUrl);

  if (validationError !== null) {
    setNotice(t('settings.notice.saveXProxyFailure', { error: validationError }), true);
    return;
  }

  busy.value = true;

  try {
    const xSource = await updateXBrowserSettings({
      proxyUrl: xProxyForm.proxyUrl.trim(),
    });
    applyXSourceSettings(xSource);
    xProxyForm.proxyUrl = '';
    setNotice(t('settings.notice.saveXProxySuccess'));
  } catch (error) {
    setNotice(t('settings.notice.saveXProxyFailure', { error: toErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function clearXProxy(): Promise<void> {
  busy.value = true;

  try {
    const xSource = await updateXBrowserSettings({ proxyUrl: '' });
    applyXSourceSettings(xSource);
    xProxyForm.proxyUrl = '';
    setNotice(t('settings.notice.clearXProxySuccess'));
  } catch (error) {
    setNotice(t('settings.notice.clearXProxyFailure', { error: toErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function runAnonymousTest(): Promise<void> {
  busy.value = true;

  try {
    const result = await testXSourceAnonymous(normalizeXDiagnosticUsername());
    anonymousCheckResult.value = result;
    setNotice(
      t('settings.notice.anonymousTestComplete', {
        status: t(anonymousStatusLabelKey(result.status)),
      }),
      result.status !== 'available',
    );
  } catch (error) {
    setNotice(t('settings.notice.anonymousTestFailure', { error: toXSourceActionErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function runLoginCheck(): Promise<void> {
  busy.value = true;

  try {
    const result = await checkXSourceLogin(normalizeXDiagnosticUsername());
    loginCheckResult.value = result;
    setNotice(
      t('settings.notice.loginCheckComplete', {
        status: t(loginStatusLabelKey(result.status)),
      }),
      result.status !== 'logged_in_or_public_available',
    );
  } catch (error) {
    setNotice(t('settings.notice.loginCheckFailure', { error: toXSourceActionErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function openLoginWindow(): Promise<void> {
  busy.value = true;

  try {
    await openXLoginWindow();
    setNotice(t('settings.notice.openXLoginSuccess'));
  } catch (error) {
    setNotice(t('settings.notice.openXLoginFailure', { error: toXSourceActionErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function createTarget(): Promise<void> {
  const validationError = validateDeliveryTargetForm(newTargetForm.displayName, newTargetForm.webhookUrl, {
    requireWebhookUrl: true,
  });

  if (validationError !== null) {
    setNotice(t('settings.notice.createTargetFailure', { error: validationError }), true);
    return;
  }

  busy.value = true;

  try {
    await createDeliveryTarget({
      displayName: newTargetForm.displayName.trim(),
      enabled: newTargetForm.enabled,
      webhookUrl: newTargetForm.webhookUrl.trim(),
    });
    resetNewTargetForm();
    const nextTotal = deliveryTargetSummary.value.total + 1;
    const targetPage = Math.max(1, Math.ceil(nextTotal / deliveryTargetPagination.value.pageSize));
    await loadDeliveryTargets(targetPage, { silent: true });
    setNotice(t('settings.notice.createTargetSuccess'));
  } catch (error) {
    setNotice(t('settings.notice.createTargetFailure', { error: toDeliveryTargetErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

function openEditTarget(target: DeliveryTarget): void {
  editingTarget.value = target;
  editTargetForm.displayName = target.displayName;
  editTargetForm.webhookUrl = '';
}

function closeEditTarget(): void {
  editingTarget.value = null;
  editTargetForm.displayName = '';
  editTargetForm.webhookUrl = '';
}

async function saveTargetEdit(): Promise<void> {
  if (editingTarget.value === null) {
    return;
  }

  const validationError = validateDeliveryTargetForm(editTargetForm.displayName, editTargetForm.webhookUrl, {
    requireWebhookUrl: false,
  });

  if (validationError !== null) {
    setNotice(t('settings.notice.editTargetFailure', { error: validationError }), true);
    return;
  }

  busy.value = true;

  try {
    const webhookUrl = editTargetForm.webhookUrl.trim();
    const result = await updateDeliveryTarget(editingTarget.value.id, {
      displayName: editTargetForm.displayName.trim(),
      ...(webhookUrl.length === 0 ? {} : { webhookUrl }),
    });
    replaceDeliveryTarget(result.deliveryTarget);
    await loadDeliveryTargets(deliveryTargetPagination.value.page, { silent: true });
    closeEditTarget();
    setNotice(t('settings.notice.editTargetSuccess'));
  } catch (error) {
    setNotice(t('settings.notice.editTargetFailure', { error: toDeliveryTargetErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function toggleTargetEnabled(target: DeliveryTarget): Promise<void> {
  busy.value = true;
  const nextEnabled = !target.enabled;

  try {
    const result = await updateDeliveryTargetEnabled(target.id, nextEnabled);
    await loadDeliveryTargets(deliveryTargetPagination.value.page, { silent: true });
    replaceDeliveryTarget(result.deliveryTarget);
    setNotice(
      result.deliveryTarget.enabled
        ? t('settings.notice.enableTargetSuccess')
        : t('settings.notice.disableTargetSuccess'),
    );
  } catch (error) {
    setNotice(
      t(nextEnabled ? 'settings.notice.enableTargetFailure' : 'settings.notice.disableTargetFailure', {
        error: toErrorMessage(error),
      }),
      true,
    );
  } finally {
    busy.value = false;
  }
}

function askDeleteTarget(target: DeliveryTarget): void {
  deleteTarget.value = target;
}

async function confirmDeleteTarget(): Promise<void> {
  if (deleteTarget.value === null) {
    return;
  }

  busy.value = true;

  try {
    const targetName = deleteTarget.value.displayName;
    const result = await deleteDeliveryTarget(deleteTarget.value.id);
    deleteTarget.value = null;
    await loadDeliveryTargets(deliveryTargetPagination.value.page, { silent: true });
    setNotice(t('settings.notice.deleteTargetSuccess', { targetName, deadEventsCount: result.deadEventsCount }));
  } catch (error) {
    setNotice(t('settings.notice.deleteTargetFailure', { error: toErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function testTarget(target: DeliveryTarget): Promise<void> {
  busy.value = true;

  try {
    const result = await testDeliveryTarget(target.id);
    replaceDeliveryTarget({
      ...target,
      webhookPreview: result.webhookPreview,
    });
    setNotice(t('settings.notice.testTargetSuccess', { targetKey: result.targetKey, providerCode: result.providerCode }));
  } catch (error) {
    setNotice(t('settings.notice.testTargetFailure', { error: toErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

function applySettings(loadedSettings: RuntimeSettingsSummary): void {
  settings.value = loadedSettings;
  pollingForm.excludeReplies = loadedSettings.polling.excludeReplies;
  pollingForm.excludeReposts = loadedSettings.polling.excludeReposts;
  pollingForm.fetchLimitPerAccount = loadedSettings.polling.fetchLimitPerAccount;
  pollingForm.intervalSeconds = loadedSettings.polling.intervalSeconds;
}

function applyXSourceSettings(loadedXSourceSettings: RuntimeXSourceSettings): void {
  xSourceSettings.value = loadedXSourceSettings;

  if (settings.value === null) {
    return;
  }

  settings.value = {
    ...settings.value,
    readonly: {
      ...settings.value.readonly,
      sourceMode: loadedXSourceSettings.mode,
      xBrowserBaseUrl: loadedXSourceSettings.browser.baseUrl,
      xBrowserHeadless: loadedXSourceSettings.browser.headless,
      xBrowserProxyConfigured: loadedXSourceSettings.browser.proxyConfigured,
      xBrowserProxyPreview: loadedXSourceSettings.browser.proxyPreview,
      xBrowserProxySource: loadedXSourceSettings.browser.proxySource,
      xBrowserUserDataDir: loadedXSourceSettings.browser.userDataDir,
    },
  };
}

function applyDeliveryTargets(result: {
  deliveryTargets: DeliveryTarget[];
  pagination: AdminPagination;
  summary: DeliveryTargetSummary;
}): void {
  deliveryTargets.value = result.deliveryTargets;
  deliveryTargetPagination.value = result.pagination;
  deliveryTargetSummary.value = result.summary;
}

function replaceDeliveryTarget(nextTarget: DeliveryTarget): void {
  deliveryTargets.value = deliveryTargets.value.map((target) =>
    target.id === nextTarget.id ? nextTarget : target,
  );

  if (editingTarget.value?.id === nextTarget.id) {
    editingTarget.value = nextTarget;
  }
}

function resetNewTargetForm(): void {
  newTargetForm.displayName = '';
  newTargetForm.enabled = true;
  newTargetForm.webhookUrl = '';
}

function toDeliveryTargetQuery(page: number): { page: number; pageSize: number } {
  return {
    page,
    pageSize: deliveryTargetPagination.value.pageSize,
  };
}

function validatePollingForm(): string | null {
  if (!Number.isInteger(pollingForm.intervalSeconds)) {
    return t('settings.validation.intervalInteger');
  }

  if (pollingForm.intervalSeconds < 10 || pollingForm.intervalSeconds > 3600) {
    return t('settings.validation.intervalRange');
  }

  if (!Number.isInteger(pollingForm.fetchLimitPerAccount)) {
    return t('settings.validation.fetchLimitInteger');
  }

  if (pollingForm.fetchLimitPerAccount < 1 || pollingForm.fetchLimitPerAccount > 100) {
    return t('settings.validation.fetchLimitRange');
  }

  return null;
}

function validateDeliveryTargetForm(
  displayName: string,
  webhookUrl: string,
  options: { requireWebhookUrl: boolean },
): string | null {
  const normalizedDisplayName = displayName.trim();
  const normalizedWebhookUrl = webhookUrl.trim();

  if (normalizedDisplayName.length === 0) {
    return t('settings.validation.displayNameRequired');
  }

  if (normalizedDisplayName.length > 100) {
    return t('settings.validation.displayNameMax');
  }

  if (normalizedWebhookUrl.length === 0) {
    return options.requireWebhookUrl ? t('settings.validation.webhookRequired') : null;
  }

  return validateWebhookUrl(normalizedWebhookUrl);
}

function validateWebhookUrl(value: string): string | null {
  try {
    const parsedUrl = new URL(value);

    if (parsedUrl.protocol !== 'https:') {
      return t('settings.validation.webhookHttps');
    }
  } catch {
    return t('settings.validation.webhookInvalid');
  }

  return null;
}

function validateXProxyUrl(value: string): string | null {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    const supportedProtocols = new Set(['http:', 'https:', 'socks5:']);

    if (!supportedProtocols.has(parsedUrl.protocol)) {
      return t('settings.xSource.validation.proxyProtocol');
    }
  } catch {
    return t('settings.xSource.validation.proxyInvalid');
  }

  return null;
}

function sourceLabel(source: RuntimeSettingSource): string {
  return source === 'database_override' ? t('settings.source.databaseOverride') : t('settings.source.envDefault');
}

function isBrowserSourceMode(): boolean {
  return xSourceSettings.value?.mode === 'browser';
}

function normalizeXDiagnosticUsername(): string {
  const normalizedUsername = xDiagnosticUsername.value.trim().replace(/^@+/, '');
  const fallbackUsername = normalizedUsername.length === 0 ? 'openai' : normalizedUsername;
  xDiagnosticUsername.value = fallbackUsername;
  return fallbackUsername;
}

function anonymousStatusClass(status: XSourceAnonymousCheckStatus): string {
  if (status === 'available') {
    return 'good';
  }

  if (status === 'login_required' || status === 'rate_limited') {
    return 'warn';
  }

  return 'bad';
}

function loginStatusClass(status: XSourceLoginCheckStatus): string {
  if (status === 'logged_in_or_public_available') {
    return 'good';
  }

  if (status === 'login_required' || status === 'rate_limited') {
    return 'warn';
  }

  return 'bad';
}

function anonymousStatusLabelKey(status: XSourceAnonymousCheckStatus): MessageKey {
  const statusKeys: Record<XSourceAnonymousCheckStatus, MessageKey> = {
    account_not_found: 'settings.xSource.anonymousStatus.accountNotFound',
    available: 'settings.xSource.anonymousStatus.available',
    login_required: 'settings.xSource.anonymousStatus.loginRequired',
    network_error: 'settings.xSource.anonymousStatus.networkError',
    page_unreadable: 'settings.xSource.anonymousStatus.pageUnreadable',
    rate_limited: 'settings.xSource.anonymousStatus.rateLimited',
  };

  return statusKeys[status];
}

function anonymousStatusDetailKey(status: XSourceAnonymousCheckStatus): MessageKey {
  const statusKeys: Record<XSourceAnonymousCheckStatus, MessageKey> = {
    account_not_found: 'settings.xSource.anonymousDetail.accountNotFound',
    available: 'settings.xSource.anonymousDetail.available',
    login_required: 'settings.xSource.anonymousDetail.loginRequired',
    network_error: 'settings.xSource.anonymousDetail.networkError',
    page_unreadable: 'settings.xSource.anonymousDetail.pageUnreadable',
    rate_limited: 'settings.xSource.anonymousDetail.rateLimited',
  };

  return statusKeys[status];
}

function loginStatusLabelKey(status: XSourceLoginCheckStatus): MessageKey {
  const statusKeys: Record<XSourceLoginCheckStatus, MessageKey> = {
    logged_in_or_public_available: 'settings.xSource.loginStatus.loggedInOrPublic',
    login_required: 'settings.xSource.loginStatus.loginRequired',
    network_error: 'settings.xSource.loginStatus.networkError',
    page_unreadable: 'settings.xSource.loginStatus.pageUnreadable',
    rate_limited: 'settings.xSource.loginStatus.rateLimited',
  };

  return statusKeys[status];
}

function loginStatusDetailKey(status: XSourceLoginCheckStatus): MessageKey {
  const statusKeys: Record<XSourceLoginCheckStatus, MessageKey> = {
    logged_in_or_public_available: 'settings.xSource.loginDetail.loggedInOrPublic',
    login_required: 'settings.xSource.loginDetail.loginRequired',
    network_error: 'settings.xSource.loginDetail.networkError',
    page_unreadable: 'settings.xSource.loginDetail.pageUnreadable',
    rate_limited: 'settings.xSource.loginDetail.rateLimited',
  };

  return statusKeys[status];
}

function setNotice(message: string, danger = false): void {
  notice.value = message;
  noticeDanger.value = danger;
}

function toDeliveryTargetErrorMessage(error: unknown): string {
  const message = toErrorMessage(error);
  return message.includes('\u5df2\u5b58\u5728') ? t('settings.notice.duplicateWebhook') : sanitizeWebhookMessage(message);
}

function toXSourceActionErrorMessage(error: unknown): string {
  if (error instanceof AdminApiRequestError) {
    if (error.code === 'GRAPHICAL_ENV_UNAVAILABLE') {
      return t('settings.xSource.openLoginNoGui');
    }

    if (error.code === 'X_SOURCE_MODE_NOT_BROWSER') {
      return t('settings.xSource.browserModeRequired');
    }

    if (error.code === 'X_LOGIN_WINDOW_OPEN_FAILED') {
      return t('settings.xSource.openLoginGenericFailure');
    }
  }

  return toErrorMessage(error);
}

function toErrorMessage(error: unknown): string {
  return sanitizeSensitiveMessage(error instanceof Error ? error.message : String(error));
}

function sanitizeSensitiveMessage(message: string): string {
  return sanitizeProxyMessage(sanitizeWebhookMessage(message));
}

function sanitizeWebhookMessage(message: string): string {
  return message
    .replace(/https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[^\s"'，。)）]+/gi, t('settings.webhookHidden'))
    .replace(/https:\/\/[^\s"'，。)）]*(?:feishu|larksuite)[^\s"'，。)）]*/gi, t('settings.webhookHidden'));
}

function sanitizeProxyMessage(message: string): string {
  return message.replace(
    /\b(https?|socks5):\/\/[^/\s"'，。)）@]+:[^@\s"'，。)）]+@/gi,
    '$1://[REDACTED]@',
  );
}
</script>
