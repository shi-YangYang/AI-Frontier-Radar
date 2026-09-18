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
              <div class="settings-field">
                <span>{{ t('settings.feishu.channelTypeLabel') }}</span>
                <SelectControl
                  v-model="newTargetForm.channelType"
                  :aria-label="t('settings.feishu.channelTypeLabel')"
                  :disabled="busy"
                  :options="channelTypeOptions"
                />
              </div>
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
                  :placeholder="newTargetUrlPlaceholder"
                  type="url"
                />
              </label>

              <label v-if="newTargetForm.channelType === 'dingtalk_webhook'">
                <span>{{ t('settings.feishu.secretLabel') }}</span>
                <input
                  v-model="newTargetForm.secret"
                  autocomplete="off"
                  :placeholder="t('settings.feishu.secretPlaceholder')"
                />
                <small>{{ t('settings.feishu.secretHelp') }}</small>
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

            <EmptyState
              v-if="deliveryTargets.length === 0"
              :title="t('settings.feishu.emptyTitle')"
              :description="t('settings.feishu.empty')"
            />
            <div v-else class="table-wrap">
              <table class="delivery-target-table">
                <thead>
                  <tr>
                    <th>{{ t('settings.feishu.table.channel') }}</th>
                    <th>{{ t('settings.feishu.displayNameLabel') }}</th>
                    <th>{{ t('settings.feishu.table.enabled') }}</th>
                    <th>{{ t('settings.feishu.table.preview') }}</th>
                    <th>{{ t('table.actions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="target in deliveryTargets" :key="target.id">
                    <td>
                      <span class="status-badge neutral">{{ channelTypeLabel(target.channelType) }}</span>
                    </td>
                    <td>
                      <strong>{{ target.displayName }}</strong>
                    </td>
                    <td>
                      <span class="status-badge" :class="target.enabled ? 'good' : 'neutral'">
                        {{ target.enabled ? t('settings.status.enabled') : t('settings.status.disabled') }}
                      </span>
                    </td>
                    <td><code class="wrap">{{ target.webhookPreview }}</code></td>
                    <td>
                      <div class="target-actions">
                        <button type="button" :disabled="busy" @click="openEditTarget(target)">{{ t('actions.edit') }}</button>
                        <button type="button" :disabled="busy" @click="toggleTargetEnabled(target)">
                          {{ target.enabled ? t('actions.disable') : t('actions.enable') }}
                        </button>
                        <button type="button" :disabled="busy" @click="testTarget(target)">{{ t('actions.testSend') }}</button>
                        <button class="text-button danger-text" type="button" :disabled="busy" @click="askDeleteTarget(target)">
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
                  v-model.number="pollingForm.intervalMinutes"
                  inputmode="numeric"
                  max="3600"
                  min="1"
                  type="number"
                />
                <small>{{ t('settings.polling.rangeSeconds') }}</small>
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
                </small>
              </label>

              <label class="checkbox-row">
                <input v-model="pollingForm.excludeReplies" type="checkbox" />
                <span>{{ t('settings.polling.excludeReplies') }}</span>
              </label>

              <label class="checkbox-row">
                <input v-model="pollingForm.excludeReposts" type="checkbox" />
                <span>{{ t('settings.polling.excludeReposts') }}</span>
              </label>

              <p class="muted polling-source-note">
                {{ t('settings.polling.sourceNote', { source: pollingSourceSummary }) }}
              </p>
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
                  <span class="muted">({{ sourceLabel(xSourceSettings.browser.headlessSource) }})</span>
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
                <h2>{{ t('settings.xSource.runModeTitle') }}</h2>
                <p>{{ t('settings.xSource.runModeDescription') }}</p>
              </div>
            </header>

            <form class="settings-form x-source-form" @submit.prevent="saveXRunMode">
              <div class="settings-field">
                <span>{{ t('settings.xSource.runModeLabel') }}</span>
                <SelectControl
                  v-model="xRunModeForm.mode"
                  :aria-label="t('settings.xSource.runModeLabel')"
                  :disabled="!isBrowserSourceMode()"
                  :options="runModeOptions"
                />
                <small>{{ t('settings.xSource.runModeHelp') }}</small>
              </div>
              <div class="form-actions x-source-actions">
                <button class="primary" type="submit" :disabled="busy || !isBrowserSourceMode()">
                  {{ t('settings.xSource.saveRunMode') }}
                </button>
              </div>
            </form>
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

          <article class="panel settings-form-panel settings-wide">
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

        <section v-else-if="activeSettingsTab === 'rss'" class="settings-layout single-column">
          <article class="panel settings-wide">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.rss.summaryTitle') }}</h2>
                <p>{{ t('settings.rss.summaryDescription') }}</p>
              </div>
            </header>
            <dl class="detail-list">
              <div>
                <dt>{{ t('settings.rss.proxyPreview') }}</dt>
                <dd>
                  <code class="wrap">
                    {{ rssSettings?.proxyPreview ?? t('settings.rss.proxyNotConfigured') }}
                  </code>
                  <span v-if="rssSettings !== null" class="muted">
                    ({{ sourceLabel(rssSettings.proxySource) }})
                  </span>
                </dd>
              </div>
            </dl>
          </article>

          <article class="panel settings-form-panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.rss.proxyTitle') }}</h2>
                <p>{{ t('settings.rss.proxyDescription') }}</p>
              </div>
            </header>

            <form class="settings-form" @submit.prevent="saveRssProxy">
              <label>
                <span>{{ t('settings.rss.proxyUrlLabel') }}</span>
                <input
                  v-model="rssProxyForm.proxyUrl"
                  autocomplete="off"
                  inputmode="url"
                  :placeholder="t('settings.rss.proxyUrlPlaceholder')"
                />
                <small>{{ t('settings.rss.proxyHelp') }}</small>
              </label>
              <div class="inline-alert">
                {{ t('settings.rss.proxySecurityHint') }}
              </div>
              <div class="form-actions">
                <button class="primary" type="submit" :disabled="busy">
                  {{ t('settings.rss.saveProxy') }}
                </button>
                <button type="button" :disabled="busy" @click="clearRssProxy">
                  {{ t('settings.rss.clearProxy') }}
                </button>
              </div>
            </form>
          </article>
        </section>

        <section v-else-if="activeSettingsTab === 'rules'" class="settings-layout single-column">
          <article class="panel settings-wide">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.rules.title') }}</h2>
                <p>{{ t('settings.rules.description') }}</p>
              </div>
            </header>
            <div class="settings-form">
              <div v-if="subscriptionRules.length === 0" class="empty-panel">
                {{ t('settings.rules.empty') }}
              </div>
              <div v-for="rule in subscriptionRules" :key="rule.id" class="rule-row">
                <label class="compact-checkbox">
                  <input
                    type="checkbox"
                    :checked="rule.enabled"
                    :disabled="busy"
                    @change="toggleSubscriptionRule(rule)"
                  />
                  <span>{{ rule.name }}</span>
                </label>
                <div class="rule-summary">
                  <span class="status-badge neutral">
                    {{ rule.mode === 'all' ? t('settings.rules.modeAll') : t('settings.rules.modeAny') }}
                  </span>
                  <code class="wrap">+ {{ rule.include.join(' / ') || '-' }}</code>
                  <code v-if="rule.exclude.length > 0" class="wrap">- {{ rule.exclude.join(' / ') }}</code>
                </div>
                <span class="status-badge neutral">{{ ruleChannelsLabel(rule) }}</span>
                <button class="danger" type="button" :disabled="busy" @click="deleteSubscriptionRule(rule)">
                  {{ t('actions.delete') }}
                </button>
              </div>

              <form class="rule-add-form" @submit.prevent="addSubscriptionRule">
                <label>
                  <span>{{ t('settings.rules.nameLabel') }}</span>
                  <input
                    v-model="ruleForm.name"
                    autocomplete="off"
                    :disabled="busy"
                    :placeholder="t('settings.rules.namePlaceholder')"
                  />
                </label>
                <label>
                  <span>{{ t('settings.rules.includeLabel') }}</span>
                  <input
                    v-model="ruleForm.include"
                    autocomplete="off"
                    :disabled="busy"
                    :placeholder="t('settings.rules.includePlaceholder')"
                  />
                </label>
                <label>
                  <span>{{ t('settings.rules.excludeLabel') }}</span>
                  <input
                    v-model="ruleForm.exclude"
                    autocomplete="off"
                    :disabled="busy"
                    :placeholder="t('settings.rules.excludePlaceholder')"
                  />
                </label>
                <div class="settings-field">
                  <span>{{ t('settings.rules.modeLabel') }}</span>
                  <SelectControl
                    v-model="ruleForm.mode"
                    :aria-label="t('settings.rules.modeLabel')"
                    :disabled="busy"
                    :options="ruleModeOptions"
                  />
                </div>
                <div class="settings-field rule-channel-field">
                  <span>{{ t('settings.rules.channelsLabel') }}</span>
                  <div class="rule-channel-options">
                    <label v-for="target in deliveryTargets" :key="target.targetKey" class="checkbox-row compact-checkbox">
                      <input v-model="ruleForm.targetKeys" :disabled="busy" :value="target.targetKey" type="checkbox" />
                      <span>{{ target.displayName }}</span>
                    </label>
                    <small v-if="deliveryTargets.length === 0" class="muted">
                      {{ t('settings.rules.channelsEmpty') }}
                    </small>
                  </div>
                  <small>{{ t('settings.rules.channelsHint') }}</small>
                </div>
                <div class="form-actions">
                  <button class="primary" type="submit" :disabled="busy">
                    {{ t('settings.rules.add') }}
                  </button>
                </div>
              </form>

              <div class="inline-alert">{{ t('settings.rules.hint') }}</div>
            </div>
          </article>
        </section>

        <section v-else-if="activeSettingsTab === 'wechat'" class="settings-layout single-column">
          <article class="panel settings-form-panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.wechat.title') }}</h2>
                <p>{{ t('settings.wechat.description') }}</p>
              </div>
              <button type="button" :disabled="busy" @click="loadWechatStatus">
                {{ t('actions.refresh') }}
              </button>
            </header>

            <div class="settings-form wechat-form">
              <div v-if="wechatStatus === null" class="empty-panel">{{ t('settings.loading') }}</div>
              <template v-else>
              <div
                v-if="!wechatStatus.installed"
                class="inline-alert"
              >
                {{ t('settings.wechat.notInstalled') }}
              </div>

              <dl class="detail-list">
                <div>
                  <dt>{{ t('settings.wechat.bridgeStatus') }}</dt>
                  <dd>
                    <span class="status-badge" :class="wechatStatus.running ? 'good' : 'neutral'">
                      {{ wechatStatus.running ? t('settings.wechat.running') : t('settings.wechat.stopped') }}
                    </span>
                    <span class="muted"> :{{ wechatStatus.port }}</span>
                  </dd>
                </div>
                <div>
                  <dt>{{ t('settings.wechat.loginStatus') }}</dt>
                  <dd>
                    <span class="status-badge" :class="wechatStatus.loggedIn ? 'good' : 'neutral'">
                      {{ wechatStatus.loggedIn ? t('settings.wechat.loggedIn') : t('settings.wechat.notLoggedIn') }}
                    </span>
                  </dd>
                </div>
                <div v-if="wechatStatus.message">
                  <dt>{{ t('settings.wechat.detail') }}</dt>
                  <dd>{{ wechatStatus.message }}</dd>
                </div>
              </dl>

              <div class="settings-actions">
                <button
                  class="primary"
                  type="button"
                  :disabled="busy || !wechatStatus.installed || !wechatStatus.running"
                  @click="startWechatLoginNow"
                >
                  {{ wechatStatus.accounts.length > 0 ? t('settings.wechat.addAccount') : t('settings.wechat.login') }}
                </button>
                <button
                  type="button"
                  :disabled="busy || !wechatStatus.loggedIn"
                  @click="sendWechatTest"
                >
                  {{ t('settings.wechat.testSend') }}
                </button>
              </div>

              <div v-if="wechatQrCode !== null" class="wechat-qr-block">
                <img v-if="wechatStatus.qrcodeDataUrl" :src="wechatStatus.qrcodeDataUrl" alt="WeChat login QR" class="wechat-qr-image" />
                <a v-if="wechatStatus.qrcodeUrl" :href="wechatStatus.qrcodeUrl" rel="noreferrer" target="_blank">
                  {{ t('settings.wechat.openQrLink') }}
                </a>
                <p class="muted">{{ t('settings.wechat.scanHint') }}</p>
                <form v-if="wechatStatus.loginStatus === 'need-code'" class="settings-form" @submit.prevent="submitWechatCode">
                  <label>
                    <span>{{ t('settings.wechat.codeLabel') }}</span>
                    <input v-model="wechatCodeInput" autocomplete="off" :placeholder="t('settings.wechat.codePlaceholder')" />
                  </label>
                  <div class="form-actions">
                    <button class="primary" type="submit" :disabled="busy">{{ t('settings.wechat.submitCode') }}</button>
                  </div>
                </form>
              </div>

              <div class="settings-field">
                <span>{{ t('settings.wechat.accountsTitle') }}</span>
                <p class="muted wechat-delivery-hint">{{ t('settings.wechat.accountsAutoPush') }}</p>
                <div v-if="wechatStatus.accounts.length === 0" class="empty-panel">
                  {{ t('settings.wechat.accountsEmpty') }}
                </div>
                <table v-else class="data-table">
                  <thead>
                    <tr>
                      <th>{{ t('settings.wechat.accountId') }}</th>
                      <th>{{ t('settings.wechat.accountUser') }}</th>
                      <th>{{ t('settings.wechat.accountPush') }}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="account in wechatStatus.accounts" :key="account.accountId">
                      <td><code>{{ account.accountId }}</code></td>
                      <td><code>{{ account.userId ?? '-' }}</code></td>
                      <td>
                        <label class="checkbox-row compact-checkbox">
                          <input
                            type="checkbox"
                            :checked="account.pushEnabled"
                            :disabled="busy"
                            @change="toggleWechatAccountPush(account)"
                          />
                          <span class="muted">{{ t('settings.wechat.accountPushHint') }}</span>
                        </label>
                      </td>
                      <td class="table-actions">
                        <button
                          class="link-danger"
                          type="button"
                          :disabled="busy"
                          @click="wechatAccountToDelete = account"
                        >
                          {{ t('actions.delete') }}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              </template>
            </div>
          </article>
        </section>

        <section v-else-if="activeSettingsTab === 'data'" class="settings-layout single-column">
          <article class="panel settings-form-panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.data.retentionTitle') }}</h2>
                <p>{{ t('settings.data.retentionDescription') }}</p>
              </div>
            </header>

            <div v-if="dataSettings === null" class="empty-panel">{{ t('settings.loading') }}</div>
            <form v-else class="settings-form" @submit.prevent="saveDataSettings">
              <label>
                <span>{{ t('settings.data.retentionDaysLabel') }}</span>
                <input
                  v-model.number="retentionDaysInput"
                  :disabled="busy"
                  min="0"
                  max="3650"
                  type="number"
                />
                <small class="muted">{{ t('settings.data.retentionDaysHint') }}</small>
              </label>

              <dl class="detail-list">
                <div>
                  <dt>{{ t('settings.data.expiredPosts') }}</dt>
                  <dd>{{ dataSettings.expiredPosts }}</dd>
                </div>
                <div>
                  <dt>{{ t('settings.data.expiredEvents') }}</dt>
                  <dd>{{ dataSettings.expiredEvents }}</dd>
                </div>
                <div>
                  <dt>{{ t('settings.data.lastCleanupAt') }}</dt>
                  <dd>{{ dataSettings.lastCleanupAt ?? '-' }}</dd>
                </div>
              </dl>

              <div class="settings-actions">
                <button class="primary" type="submit" :disabled="busy">
                  {{ t('actions.save') }}
                </button>
                <button
                  class="danger"
                  type="button"
                  :disabled="busy || dataSettings.retentionDays === 0 || dataSettings.expiredPosts === 0"
                  @click="cleanupOpen = true"
                >
                  {{ t('settings.data.cleanupNow') }}
                </button>
              </div>
            </form>
          </article>

          <article class="panel settings-form-panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.data.backupTitle') }}</h2>
                <p>{{ t('settings.data.backupDescription') }}</p>
              </div>
            </header>

            <div class="settings-actions">
              <button class="primary" type="button" :disabled="busy" @click="createBackupNow">
                {{ t('settings.data.createBackup') }}
              </button>
            </div>

            <div v-if="backups.length === 0" class="empty-panel">
              {{ t('settings.data.backupEmpty') }}
            </div>
            <table v-else class="data-table">
              <thead>
                <tr>
                  <th>{{ t('settings.data.backupName') }}</th>
                  <th>{{ t('settings.data.backupSize') }}</th>
                  <th>{{ t('settings.data.backupCreatedAt') }}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="backup in backups" :key="backup.name">
                  <td><code>{{ backup.name }}</code></td>
                  <td>{{ formatBytes(backup.sizeBytes) }}</td>
                  <td>{{ formatDateTime(backup.createdAt) }}</td>
                  <td class="table-actions">
                    <a :href="backupDownloadUrl(backup.name)">{{ t('actions.download') }}</a>
                    <button
                      class="link-danger"
                      type="button"
                      :disabled="busy"
                      @click="deleteBackupFile(backup)"
                    >
                      {{ t('actions.delete') }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>

            <div class="inline-alert">{{ t('settings.data.restoreHint') }}</div>
          </article>
        </section>

        <section v-else-if="activeSettingsTab === 'users'" class="settings-layout single-column">
          <article class="panel settings-form-panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.users.addTitle') }}</h2>
                <p>{{ t('settings.users.addDescription') }}</p>
              </div>
            </header>
            <form class="settings-form users-create-form" @submit.prevent="submitCreateUser">
              <label>
                <span>{{ t('settings.users.usernameLabel') }}</span>
                <input
                  v-model="newUserForm.username"
                  autocomplete="off"
                  maxlength="32"
                  :placeholder="t('settings.users.usernamePlaceholder')"
                />
              </label>
              <label>
                <span>{{ t('settings.users.passwordLabel') }}</span>
                <input
                  v-model="newUserForm.password"
                  autocomplete="new-password"
                  type="password"
                  :placeholder="t('settings.users.passwordPlaceholder')"
                />
              </label>
              <label>
                <span>{{ t('settings.users.roleLabel') }}</span>
                <SelectControl
                  v-model="newUserForm.role"
                  :aria-label="t('settings.users.roleLabel')"
                  :disabled="busy"
                  :options="userRoleOptions"
                />
              </label>
              <button class="primary" type="submit" :disabled="busy">{{ t('settings.users.createAction') }}</button>
            </form>
          </article>

          <article class="panel">
            <header class="panel-header">
              <div>
                <h2>{{ t('settings.users.listTitle') }}</h2>
                <p>{{ t('settings.users.listDescription') }}</p>
              </div>
            </header>
            <div v-if="users.length === 0" class="empty-panel">{{ t('settings.users.empty') }}</div>
            <div v-else class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{{ t('settings.users.table.username') }}</th>
                    <th>{{ t('settings.users.table.role') }}</th>
                    <th>{{ t('settings.users.table.createdAt') }}</th>
                    <th>{{ t('settings.users.table.actions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="user in users" :key="user.id">
                    <td>
                      <strong>{{ user.username }}</strong>
                      <span v-if="user.id === currentUserId" class="muted"> · {{ t('settings.users.self') }}</span>
                    </td>
                    <td>
                      <span class="status-badge" :class="user.role === 'admin' ? 'good' : 'neutral'">
                        {{ user.role === 'admin' ? t('auth.roleAdmin') : t('auth.roleUser') }}
                      </span>
                    </td>
                    <td class="muted">{{ formatDateTime(user.createdAt) }}</td>
                    <td>
                      <div class="row-actions">
                        <button type="button" :disabled="busy" @click="openResetPassword(user)">
                          {{ t('settings.users.resetPassword') }}
                        </button>
                        <button
                          class="danger"
                          type="button"
                          :disabled="busy || user.id === currentUserId"
                          @click="userToDelete = user"
                        >
                          {{ t('actions.delete') }}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
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

    <ConfirmModal
      :body="t('settings.wechat.deleteAccountBody', {
        account: wechatAccountToDelete?.accountId ?? '',
      })"
      :open="wechatAccountToDelete !== null"
      :title="t('settings.wechat.deleteAccountTitle')"
      @cancel="wechatAccountToDelete = null"
      @confirm="confirmRemoveWechatAccount"
    />

    <ConfirmModal
      :body="t('settings.data.cleanupConfirmBody', {
        events: dataSettings?.expiredEvents ?? 0,
        posts: dataSettings?.expiredPosts ?? 0,
      })"
      :open="cleanupOpen"
      :title="t('settings.data.cleanupConfirmTitle')"
      @cancel="cleanupOpen = false"
      @confirm="runCleanup"
    />

    <ConfirmModal
      :body="t('settings.users.deleteBody', { username: userToDelete?.username ?? '' })"
      :open="userToDelete !== null"
      :title="t('settings.users.deleteTitle')"
      @cancel="userToDelete = null"
      @confirm="confirmDeleteUser"
    />

    <Teleport to="body">
      <div v-if="passwordTarget !== null" class="modal-backdrop" @click.self="passwordTarget = null">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
          <header class="modal-header">
            <div>
              <h2 id="reset-password-title">{{ t('settings.users.resetTitle') }}</h2>
              <p>{{ passwordTarget.username }}</p>
            </div>
            <button class="icon-button" type="button" :aria-label="t('actions.close')" @click="passwordTarget = null">
              ×
            </button>
          </header>
          <form @submit.prevent="submitResetPassword">
            <div class="modal-body">
              <label>
                <span>{{ t('settings.users.newPasswordLabel') }}</span>
                <input
                  v-model="newPasswordInput"
                  autocomplete="new-password"
                  type="password"
                  :placeholder="t('settings.users.passwordPlaceholder')"
                />
              </label>
            </div>
            <footer class="modal-footer">
              <button type="button" @click="passwordTarget = null">{{ t('actions.cancel') }}</button>
              <button class="primary" type="submit" :disabled="busy">{{ t('settings.users.resetSubmit') }}</button>
            </footer>
          </form>
        </section>
      </div>
    </Teleport>

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
                <label v-if="editingTarget.channelType === 'dingtalk_webhook'">
                  <span>{{ t('settings.edit.newSecretLabel') }}</span>
                  <input
                    v-model="editTargetForm.secret"
                    autocomplete="off"
                    :placeholder="t('settings.edit.newSecretPlaceholder')"
                  />
                  <small>
                    {{
                      editingTarget.secretConfigured
                        ? t('settings.edit.secretKeepHelp')
                        : t('settings.edit.secretUnsetHelp')
                    }}
                  </small>
                </label>
              </div>

              <section class="target-preview-panel" :aria-label="t('settings.edit.currentInfoAria')">
                <h3>{{ t('settings.edit.currentInfo') }}</h3>
                <dl class="compact-detail-list">
                  <div>
                    <dt>{{ t('settings.feishu.table.channel') }}</dt>
                    <dd>{{ channelTypeLabel(editingTarget.channelType) }}</dd>
                  </div>
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
import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  AdminApiRequestError,
  backupDownloadUrl,
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  checkXSourceLogin,
  deleteWechatAccount,
  getWechatStatus,
  startWechatLogin,
  updateWechatAccountPush,
  submitWechatLoginCode,
  testWechatBridge,
  createBackup,
  createDeliveryTarget,
  deleteBackup,
  getDataSettings,
  listBackups,
  runRetentionCleanup,
  updateDataSettings,
  deleteDeliveryTarget,
  getRssSettings,
  getSettings,
  getSubscriptionRules,
  getXSourceSettings,
  listDeliveryTargets,
  openXLoginWindow,
  testDeliveryTarget,
  testXSourceAnonymous,
  updateDeliveryTarget,
  updateDeliveryTargetEnabled,
  updateRssSettings,
  updateSubscriptionRules,
  updateXBrowserSettings,
  updatePollingSettings,
  type AdminPagination,
  type DeliveryChannelType,
  type DeliveryTarget,
  type DeliveryTargetSummary,
  type RuntimeRssSettings,
  type SubscriptionRule,
  type SubscriptionRuleMode,
  type RuntimeSettingSource,
  type BackupEntry,
  type RetentionSettings,
  type RuntimeSettingsSummary,
  type UserRecord,
  type WechatAccount,
  type WechatStatus,
  type RuntimeXSourceSettings,
  type XSourceAnonymousCheckResult,
  type XSourceAnonymousCheckStatus,
  type XSourceLoginCheckResult,
  type XSourceLoginCheckStatus,
} from '../api/admin-api';
import ConfirmModal from '../components/ConfirmModal.vue';
import EmptyState from '../components/EmptyState.vue';
import PageHeader from '../components/PageHeader.vue';
import PaginationBar from '../components/PaginationBar.vue';
import SelectControl from '../components/SelectControl.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { useAuth } from '../auth';
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

const wechatAccountToDelete = ref<WechatAccount | null>(null);
const wechatCodeInput = ref('');
const wechatQrCode = ref<{ qrcodeDataUrl?: string; qrcodeUrl?: string } | null>(null);
const wechatStatus = ref<WechatStatus | null>(null);
let wechatPollTimer: ReturnType<typeof setInterval> | null = null;

async function loadWechatStatus(): Promise<void> {
  try {
    wechatStatus.value = await getWechatStatus();

    if (wechatStatus.value.loginStatus === 'connected' || wechatStatus.value.loginStatus === 'failed') {
      stopWechatPolling();
    }
  } catch (error) {
    showSettingsError(error);
  }
}

function stopWechatPolling(): void {
  if (wechatPollTimer !== null) {
    clearInterval(wechatPollTimer);
    wechatPollTimer = null;
  }
}

function startWechatPolling(): void {
  stopWechatPolling();
  wechatPollTimer = setInterval(() => {
    void loadWechatStatus();
  }, 3_000);
}

async function toggleWechatAccountPush(account: WechatAccount): Promise<void> {
  busy.value = true;

  try {
    await updateWechatAccountPush(account.accountId, !account.pushEnabled);
    wechatStatus.value = await getWechatStatus();
    notice.value = t('settings.wechat.accountPushSaved');
    noticeDanger.value = false;
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

async function confirmRemoveWechatAccount(): Promise<void> {
  const account = wechatAccountToDelete.value;

  if (account === null) {
    return;
  }

  wechatAccountToDelete.value = null;
  busy.value = true;

  try {
    await deleteWechatAccount(account.accountId);
    notice.value = t('settings.wechat.accountDeleted', { account: account.accountId });
    noticeDanger.value = false;
    await loadWechatStatus();
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

async function startWechatLoginNow(): Promise<void> {
  busy.value = true;

  try {
    const result = await startWechatLogin(wechatStatus.value?.loggedIn === true);
    wechatQrCode.value = { qrcodeDataUrl: result.qrcodeDataUrl, qrcodeUrl: result.qrcodeUrl };
    await loadWechatStatus();
    startWechatPolling();
    notice.value = t('settings.wechat.loginStarted');
    noticeDanger.value = false;
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

async function submitWechatCode(): Promise<void> {
  if (wechatCodeInput.value.trim().length === 0) {
    return;
  }

  busy.value = true;

  try {
    await submitWechatLoginCode(wechatCodeInput.value.trim());
    wechatCodeInput.value = '';
    notice.value = t('settings.wechat.codeSubmitted');
    noticeDanger.value = false;
    await loadWechatStatus();
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

async function sendWechatTest(): Promise<void> {
  busy.value = true;

  try {
    const result = await testWechatBridge();

    if (result.failed.length > 0) {
      notice.value = t('settings.wechat.testPartial', {
        count: result.sent,
        failed: result.failed.map((entry) => entry.accountId).join('、'),
      });
      noticeDanger.value = true;
    } else {
      notice.value = t('settings.wechat.testSent', { count: result.sent });
      noticeDanger.value = false;
    }
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

const backups = ref<BackupEntry[]>([]);
const cleanupOpen = ref(false);
const dataSettings = ref<RetentionSettings | null>(null);
const retentionDaysInput = ref(0);

async function loadDataSettings(): Promise<void> {
  try {
    dataSettings.value = await getDataSettings();
    retentionDaysInput.value = dataSettings.value.retentionDays;
  } catch (error) {
    showSettingsError(error);
  }
}

async function loadBackups(): Promise<void> {
  try {
    backups.value = await listBackups();
  } catch (error) {
    showSettingsError(error);
  }
}

async function saveDataSettings(): Promise<void> {
  busy.value = true;

  try {
    dataSettings.value = await updateDataSettings(retentionDaysInput.value);
    retentionDaysInput.value = dataSettings.value.retentionDays;
    notice.value = t('settings.data.saved');
    noticeDanger.value = false;
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

async function runCleanup(): Promise<void> {
  busy.value = true;
  cleanupOpen.value = false;

  try {
    const result = await runRetentionCleanup();
    dataSettings.value = result.settings;
    retentionDaysInput.value = result.settings.retentionDays;
    notice.value = t('settings.data.cleanupDone', {
      events: result.deletedEvents,
      posts: result.deletedPosts,
    });
    noticeDanger.value = false;
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

async function createBackupNow(): Promise<void> {
  busy.value = true;

  try {
    const result = await createBackup();
    backups.value = result.backups;
    notice.value = t('settings.data.backupCreated', { name: result.backup.name });
    noticeDanger.value = false;
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

async function deleteBackupFile(backup: BackupEntry): Promise<void> {
  busy.value = true;

  try {
    await deleteBackup(backup.name);
    backups.value = await listBackups();
    notice.value = t('settings.data.backupDeleted', { name: backup.name });
    noticeDanger.value = false;
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function showSettingsError(error: unknown): void {
  notice.value = error instanceof Error ? error.message : String(error);
  noticeDanger.value = true;
}

const { currentUser } = useAuth();
const currentUserId = ref('');
const newUserForm = reactive({ password: '', role: 'user' as 'admin' | 'user', username: '' });
const newPasswordInput = ref('');
const passwordTarget = ref<UserRecord | null>(null);
const userToDelete = ref<UserRecord | null>(null);
const users = ref<UserRecord[]>([]);
const userRoleOptions = computed(() => [
  { label: t('auth.roleUser'), value: 'user' },
  { label: t('auth.roleAdmin'), value: 'admin' },
]);

async function loadUsers(): Promise<void> {
  try {
    users.value = await listUsers();
  } catch (error) {
    showSettingsError(error);
  }
}

async function submitCreateUser(): Promise<void> {
  if (newUserForm.username.trim().length === 0 || newUserForm.password.length === 0) {
    notice.value = t('settings.users.createIncomplete');
    noticeDanger.value = true;

    return;
  }

  busy.value = true;

  try {
    await createUser({
      password: newUserForm.password,
      role: newUserForm.role,
      username: newUserForm.username.trim(),
    });
    newUserForm.password = '';
    newUserForm.username = '';
    newUserForm.role = 'user';
    notice.value = t('settings.users.created');
    noticeDanger.value = false;
    await loadUsers();
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

function openResetPassword(user: UserRecord): void {
  passwordTarget.value = user;
  newPasswordInput.value = '';
}

async function submitResetPassword(): Promise<void> {
  const target = passwordTarget.value;

  if (target === null) {
    return;
  }

  busy.value = true;

  try {
    await resetUserPassword(target.id, newPasswordInput.value);
    passwordTarget.value = null;
    newPasswordInput.value = '';
    notice.value = t('settings.users.passwordReset');
    noticeDanger.value = false;
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

async function confirmDeleteUser(): Promise<void> {
  const target = userToDelete.value;

  userToDelete.value = null;

  if (target === null) {
    return;
  }

  busy.value = true;

  try {
    await deleteUser(target.id);
    notice.value = t('settings.users.deleted');
    noticeDanger.value = false;
    await loadUsers();
  } catch (error) {
    showSettingsError(error);
  } finally {
    busy.value = false;
  }
}

type SettingsTabKey = 'data' | 'feishu' | 'polling' | 'rss' | 'rules' | 'users' | 'wechat' | 'xSource' | 'runtime';

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

const pollingForm = reactive({
  excludeReplies: true,
  excludeReposts: true,
  fetchLimitPerAccount: 5,
  intervalMinutes: 5,
});

const newTargetForm = reactive({
  accountId: '',
  channelType: 'feishu_webhook' as DeliveryChannelType,
  displayName: '',
  enabled: true,
  secret: '',
  target: '',
  webhookUrl: '',
});

const editTargetForm = reactive({
  accountId: '',
  displayName: '',
  secret: '',
  target: '',
  webhookUrl: '',
});

const xProxyForm = reactive({
  proxyUrl: '',
});

const rssSettings = ref<RuntimeRssSettings | null>(null);

const rssProxyForm = reactive({
  proxyUrl: '',
});

const subscriptionRules = ref<SubscriptionRule[]>([]);

const ruleForm = reactive({
  exclude: '',
  include: '',
  mode: 'any' as SubscriptionRuleMode,
  name: '',
  targetKeys: [] as string[],
});

const ruleModeOptions = computed<{ label: string; value: SubscriptionRuleMode }[]>(() => [
  { label: t('settings.rules.modeAny'), value: 'any' },
  { label: t('settings.rules.modeAll'), value: 'all' },
]);

const channelTypeOptions = computed<{ label: string; value: DeliveryChannelType }[]>(() => [
  { label: t('settings.feishu.channel.feishu'), value: 'feishu_webhook' },
  { label: t('settings.feishu.channel.wecom'), value: 'wecom_webhook' },
  { label: t('settings.feishu.channel.dingtalk'), value: 'dingtalk_webhook' },
  { label: t('settings.feishu.channel.bark'), value: 'bark' },
  { label: t('settings.feishu.channel.generic'), value: 'generic_webhook' },
]);

const channelUrlPlaceholders: Record<DeliveryChannelType, string> = {
  bark: 'https://api.day.app/your-device-key',
  dingtalk_webhook: 'https://oapi.dingtalk.com/robot/send?access_token=...',
  feishu_webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/...',
  generic_webhook: 'https://example.com/webhook',
  wechat_clawbot: 'http://127.0.0.1:3991/send',
  wecom_webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...',
};

const newTargetUrlPlaceholder = computed(() => channelUrlPlaceholders[newTargetForm.channelType]);

function channelTypeLabel(channelType: DeliveryChannelType): string {
  switch (channelType) {
    case 'bark':
      return t('settings.feishu.channel.bark');
    case 'dingtalk_webhook':
      return t('settings.feishu.channel.dingtalk');
    case 'generic_webhook':
      return t('settings.feishu.channel.generic');
    case 'wecom_webhook':
      return t('settings.feishu.channel.wecom');
    case 'wechat_clawbot':
      return t('settings.feishu.channel.wechatBridge');
    default:
      return t('settings.feishu.channel.feishu');
  }
}

function ruleChannelsLabel(rule: SubscriptionRule): string {
  if (rule.targetKeys.length === 0) {
    return t('settings.rules.channelsAll');
  }

  return rule.targetKeys
    .map((targetKey) => {
      const target = deliveryTargets.value.find((entry) => entry.targetKey === targetKey);

      return target?.displayName ?? targetKey;
    })
    .join(' / ');
}

const xRunModeForm = reactive({
  mode: 'headless' as 'headless' | 'headed',
});

const runModeOptions = computed<{ label: string; value: 'headless' | 'headed' }[]>(() => [
  { label: t('settings.xSource.runModeHeadless'), value: 'headless' },
  { label: t('settings.xSource.runModeHeaded'), value: 'headed' },
]);

const xDiagnosticUsername = ref('openai');

onMounted(() => {
  currentUserId.value = currentUser.value?.id ?? '';
  void loadSettings({ silent: true });
  void loadDataSettings();
  void loadBackups();
  void loadWechatStatus();
});

watch(activeSettingsTab, (tab) => {
  if (tab === 'wechat') {
    void loadWechatStatus();
  }

  if (tab === 'users') {
    void loadUsers();
  }
});

async function loadSettings(options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    const [loadedSettings, loadedXSourceSettings, loadedRssSettings, loadedTargets, loadedRules] =
      await Promise.all([
        getSettings(),
        getXSourceSettings(),
        getRssSettings(),
        listDeliveryTargets(toDeliveryTargetQuery(deliveryTargetPagination.value.page)),
        getSubscriptionRules(),
      ]);
    applySettings(loadedSettings);
    applyXSourceSettings(loadedXSourceSettings);
    applyRssSettings(loadedRssSettings);
    applyDeliveryTargets(loadedTargets);
    subscriptionRules.value = loadedRules;

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
      intervalSeconds: pollingForm.intervalMinutes * 60,
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

async function saveRssProxy(): Promise<void> {
  busy.value = true;

  try {
    const settings = await updateRssSettings({
      proxyUrl: rssProxyForm.proxyUrl.trim(),
    });
    applyRssSettings(settings);
    rssProxyForm.proxyUrl = '';
    setNotice(t('settings.notice.saveRssProxySuccess'));
  } catch (error) {
    setNotice(t('settings.notice.saveRssProxyFailure', { error: toErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function clearRssProxy(): Promise<void> {
  busy.value = true;

  try {
    const settings = await updateRssSettings({ proxyUrl: '' });
    applyRssSettings(settings);
    setNotice(t('settings.notice.saveRssProxySuccess'));
  } catch (error) {
    setNotice(t('settings.notice.saveRssProxyFailure', { error: toErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

function parseRuleTerms(value: string): string[] {
  return value
    .split(/[,，\n]/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

async function persistSubscriptionRules(next: SubscriptionRule[]): Promise<void> {
  busy.value = true;

  try {
    subscriptionRules.value = await updateSubscriptionRules(next);
    setNotice(t('settings.notice.saveRulesSuccess'));
  } catch (error) {
    setNotice(t('settings.notice.saveRulesFailure', { error: toErrorMessage(error) }), true);
  } finally {
    busy.value = false;
  }
}

async function addSubscriptionRule(): Promise<void> {
  const include = parseRuleTerms(ruleForm.include);
  const exclude = parseRuleTerms(ruleForm.exclude);

  if (include.length === 0 && exclude.length === 0) {
    setNotice(t('settings.notice.saveRulesFailure', { error: t('settings.rules.needTerms') }), true);
    return;
  }

  const next: SubscriptionRule[] = [
    ...subscriptionRules.value,
    {
      enabled: true,
      exclude,
      id: `rule-${Date.now()}`,
      include,
      mode: ruleForm.mode,
      name:
        ruleForm.name.trim().length > 0
          ? ruleForm.name.trim()
          : t('settings.rules.unnamed'),
      targetKeys: [...ruleForm.targetKeys],
    },
  ];

  await persistSubscriptionRules(next);

  if (subscriptionRules.value.length === next.length) {
    ruleForm.name = '';
    ruleForm.include = '';
    ruleForm.exclude = '';
    ruleForm.targetKeys = [];
  }
}

async function toggleSubscriptionRule(rule: SubscriptionRule): Promise<void> {
  await persistSubscriptionRules(
    subscriptionRules.value.map((entry) =>
      entry.id === rule.id ? { ...entry, enabled: !entry.enabled } : entry,
    ),
  );
}

async function deleteSubscriptionRule(rule: SubscriptionRule): Promise<void> {
  await persistSubscriptionRules(subscriptionRules.value.filter((entry) => entry.id !== rule.id));
}

async function saveXRunMode(): Promise<void> {
  busy.value = true;

  try {
    const xSource = await updateXBrowserSettings({
      headless: xRunModeForm.mode === 'headless',
    });
    applyXSourceSettings(xSource);
    setNotice(t('settings.notice.saveXRunModeSuccess'));
  } catch (error) {
    setNotice(t('settings.notice.saveXRunModeFailure', { error: toErrorMessage(error) }), true);
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
    const secret = newTargetForm.secret.trim();
    const target = newTargetForm.target.trim();
    const accountId = newTargetForm.accountId.trim();

    await createDeliveryTarget({
      ...(accountId.length === 0 ? {} : { accountId }),
      channelType: newTargetForm.channelType,
      displayName: newTargetForm.displayName.trim(),
      enabled: newTargetForm.enabled,
      ...(secret.length === 0 ? {} : { secret }),
      ...(target.length === 0 ? {} : { target }),
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
  editTargetForm.accountId = target.accountId ?? '';
  editTargetForm.displayName = target.displayName;
  editTargetForm.secret = '';
  editTargetForm.target = '';
  editTargetForm.webhookUrl = '';
}

function closeEditTarget(): void {
  editingTarget.value = null;
  editTargetForm.accountId = '';
  editTargetForm.displayName = '';
  editTargetForm.secret = '';
  editTargetForm.target = '';
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
    const secret = editTargetForm.secret.trim();
    const target = editTargetForm.target.trim();
    const accountId = editTargetForm.accountId.trim();
    const result = await updateDeliveryTarget(editingTarget.value.id, {
      accountId,
      displayName: editTargetForm.displayName.trim(),
      ...(secret.length === 0 ? {} : { secret }),
      ...(target.length === 0 ? {} : { target }),
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
  pollingForm.intervalMinutes = Math.max(1, Math.round(loadedSettings.polling.intervalSeconds / 60));
}

function applyRssSettings(loadedRssSettings: RuntimeRssSettings): void {
  rssSettings.value = loadedRssSettings;
}

function applyXSourceSettings(loadedXSourceSettings: RuntimeXSourceSettings): void {
  xSourceSettings.value = loadedXSourceSettings;
  xRunModeForm.mode = loadedXSourceSettings.browser.headless ? 'headless' : 'headed';

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
  newTargetForm.accountId = '';
  newTargetForm.channelType = 'feishu_webhook';
  newTargetForm.displayName = '';
  newTargetForm.enabled = true;
  newTargetForm.secret = '';
  newTargetForm.target = '';
  newTargetForm.webhookUrl = '';
}

function toDeliveryTargetQuery(page: number): {
  excludeChannelType: string;
  page: number;
  pageSize: number;
} {
  return {
    excludeChannelType: 'wechat_clawbot',
    page,
    pageSize: deliveryTargetPagination.value.pageSize,
  };
}

function validatePollingForm(): string | null {
  if (!Number.isInteger(pollingForm.intervalMinutes)) {
    return t('settings.validation.intervalInteger');
  }

  if (pollingForm.intervalMinutes < 1 || pollingForm.intervalMinutes > 3600) {
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

const pollingSourceSummary = computed(() => {
  const polling = settings.value?.polling;

  if (polling === undefined) {
    return '-';
  }

  const sources = Object.values(polling.sources);

  return sources.every((source) => source === 'env_default')
    ? t('settings.source.envDefault')
    : t('settings.source.databaseOverride');
});

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
