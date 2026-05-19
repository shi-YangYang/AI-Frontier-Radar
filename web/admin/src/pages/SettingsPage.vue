<template>
  <section>
    <PageHeader title="配置" subtitle="通过本地页面管理运行配置，敏感内容只显示脱敏预览。">
      <div class="toolbar">
        <button type="button" :disabled="busy" @click="() => loadSettings()">
          刷新
        </button>
      </div>
    </PageHeader>

    <ToastNotice :message="notice" :danger="noticeDanger" />

    <div v-if="settings === null" class="panel">
      <div class="empty-panel">正在读取配置...</div>
    </div>

    <div v-else class="settings-layout">
      <article class="panel">
        <header class="panel-header">
          <h2>轮询配置</h2>
        </header>
        <form class="settings-form" @submit.prevent="savePolling">
          <label>
            <span>轮询间隔秒数</span>
            <input
              v-model.number="pollingForm.intervalSeconds"
              inputmode="numeric"
              max="3600"
              min="10"
              type="number"
            />
            <small>允许范围：10-3600 秒。当前来源：{{ sourceLabel(settings.polling.sources.intervalSeconds) }}</small>
          </label>

          <label>
            <span>每账号抓取数量</span>
            <input
              v-model.number="pollingForm.fetchLimitPerAccount"
              inputmode="numeric"
              max="100"
              min="1"
              type="number"
            />
            <small>允许范围：1-100 条。当前来源：{{ sourceLabel(settings.polling.sources.fetchLimitPerAccount) }}</small>
          </label>

          <label class="checkbox-row">
            <input v-model="pollingForm.excludeReplies" type="checkbox" />
            <span>排除回复</span>
            <small>当前来源：{{ sourceLabel(settings.polling.sources.excludeReplies) }}</small>
          </label>

          <label class="checkbox-row">
            <input v-model="pollingForm.excludeReposts" type="checkbox" />
            <span>排除转发</span>
            <small>当前来源：{{ sourceLabel(settings.polling.sources.excludeReposts) }}</small>
          </label>

          <div class="form-actions">
            <button class="primary" type="submit" :disabled="busy">保存轮询配置</button>
          </div>
        </form>
      </article>

      <article class="panel">
        <header class="panel-header">
          <h2>飞书 Webhook</h2>
        </header>
        <div class="settings-form">
          <dl class="compact-detail-list">
            <div>
              <dt>配置状态</dt>
              <dd>
                <StatusBadge :status="settings.feishu.configured ? 'success' : 'failed'" />
              </dd>
            </div>
            <div>
              <dt>脱敏预览</dt>
              <dd><code class="wrap">{{ settings.feishu.webhookPreview ?? '未配置' }}</code></dd>
            </div>
          </dl>

          <form class="settings-form inner-form" @submit.prevent="saveFeishu">
            <label>
              <span>新的飞书 webhook</span>
              <input
                v-model="feishuWebhookUrl"
                autocomplete="off"
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                type="url"
              />
              <small>保存后输入框会清空，页面只保留脱敏预览。</small>
            </label>
            <div class="form-actions">
              <button class="primary" type="submit" :disabled="busy">保存飞书 webhook</button>
              <button type="button" :disabled="busy" @click="testFeishu">测试发送</button>
            </div>
          </form>
        </div>
      </article>

      <article class="panel settings-wide">
        <header class="panel-header">
          <h2>只读运行信息</h2>
        </header>
        <dl class="detail-list">
          <div>
            <dt>Source mode</dt>
            <dd><code>{{ settings.readonly.sourceMode }}</code></dd>
          </div>
          <div>
            <dt>SQLite 路径</dt>
            <dd><code class="wrap">{{ settings.readonly.sqlitePath }}</code></dd>
          </div>
          <div>
            <dt>Redis URL</dt>
            <dd>
              <code class="wrap">{{ settings.readonly.redisUrlPreview ?? '未配置' }}</code>
              <span class="muted">（{{ settings.readonly.redisConfigured ? '已配置' : '未配置' }}）</span>
            </dd>
          </div>
          <div>
            <dt>服务</dt>
            <dd>
              <code>{{ settings.readonly.serviceHost }}:{{ settings.readonly.servicePort }}</code>
              <span class="muted"> / {{ settings.readonly.serviceEnv }}</span>
            </dd>
          </div>
          <div>
            <dt>X 配置摘要</dt>
            <dd v-if="settings.readonly.sourceMode === 'browser'">
              <code class="wrap">
                browser，baseUrl={{ settings.readonly.xBrowserBaseUrl }}，headless={{ settings.readonly.xBrowserHeadless ? 'true' : 'false' }}，userDataDir={{ settings.readonly.xBrowserUserDataDir }}
              </code>
            </dd>
            <dd v-else>
              <code class="wrap">api，Bearer Token 不在管理页展示。</code>
            </dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import {
  getSettings,
  testFeishuSettings,
  updateFeishuSettings,
  updatePollingSettings,
  type RuntimeSettingSource,
  type RuntimeSettingsSummary,
} from '../api/admin-api';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';

const busy = ref(false);
const feishuWebhookUrl = ref('');
const notice = ref('');
const noticeDanger = ref(false);
const settings = ref<RuntimeSettingsSummary | null>(null);

const pollingForm = reactive({
  excludeReplies: true,
  excludeReposts: true,
  fetchLimitPerAccount: 5,
  intervalSeconds: 300,
});

onMounted(() => {
  void loadSettings({ silent: true });
});

async function loadSettings(options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    const loadedSettings = await getSettings();
    applySettings(loadedSettings);

    if (options.silent !== true) {
      setNotice('已刷新配置。');
    }
  } catch (error) {
    setNotice(toErrorMessage(error), true);
  } finally {
    busy.value = false;
  }
}

async function savePolling(): Promise<void> {
  const validationError = validatePollingForm();

  if (validationError !== null) {
    setNotice(validationError, true);
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

    setNotice('轮询配置已保存。');
  } catch (error) {
    setNotice(toErrorMessage(error), true);
  } finally {
    busy.value = false;
  }
}

async function saveFeishu(): Promise<void> {
  const validationError = validateWebhookUrl(feishuWebhookUrl.value);

  if (validationError !== null) {
    setNotice(validationError, true);
    return;
  }

  busy.value = true;

  try {
    const feishu = await updateFeishuSettings(feishuWebhookUrl.value);
    feishuWebhookUrl.value = '';

    if (settings.value !== null) {
      settings.value = {
        ...settings.value,
        feishu,
      };
    }

    setNotice('飞书 webhook 已保存，页面仅显示脱敏预览。');
  } catch (error) {
    setNotice(toErrorMessage(error), true);
  } finally {
    busy.value = false;
  }
}

async function testFeishu(): Promise<void> {
  busy.value = true;

  try {
    const result = await testFeishuSettings();
    setNotice(`飞书测试发送成功。providerCode=${result.providerCode}`);
  } catch (error) {
    setNotice(toErrorMessage(error), true);
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

function validatePollingForm(): string | null {
  if (!Number.isInteger(pollingForm.intervalSeconds)) {
    return '轮询间隔秒数必须是整数。';
  }

  if (pollingForm.intervalSeconds < 10 || pollingForm.intervalSeconds > 3600) {
    return '轮询间隔秒数必须在 10-3600 之间。';
  }

  if (!Number.isInteger(pollingForm.fetchLimitPerAccount)) {
    return '每账号抓取数量必须是整数。';
  }

  if (pollingForm.fetchLimitPerAccount < 1 || pollingForm.fetchLimitPerAccount > 100) {
    return '每账号抓取数量必须在 1-100 之间。';
  }

  return null;
}

function validateWebhookUrl(value: string): string | null {
  const webhookUrl = value.trim();

  if (webhookUrl.length === 0) {
    return '飞书 webhook 不能为空。';
  }

  try {
    const parsedUrl = new URL(webhookUrl);

    if (parsedUrl.protocol !== 'https:') {
      return '飞书 webhook 必须是 https URL。';
    }
  } catch {
    return '飞书 webhook 必须是有效 URL。';
  }

  return null;
}

function sourceLabel(source: RuntimeSettingSource): string {
  return source === 'database_override' ? 'SQLite 覆盖' : '.env 默认';
}

function setNotice(message: string, danger = false): void {
  notice.value = message;
  noticeDanger.value = danger;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
</script>
