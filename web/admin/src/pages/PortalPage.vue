<template>
  <div class="me-shell">
    <header class="me-hero">
      <div class="me-hero-inner">
        <div class="me-hero-row">
          <span class="me-avatar">
            <BrandLogo :alt="t('brand.name')" />
          </span>
          <div class="me-hero-text">
            <strong>{{ t('brand.name') }}</strong>
            <small>{{ t('brand.subtitle') }}</small>
          </div>
          <div class="me-hero-actions">
            <span class="me-user-name">{{ t('portal.greeting', { username: currentUser?.nickname ?? currentUser?.username ?? '' }) }}</span>
            <button class="me-ghost-button" type="button" @click="toggleLanguage">
              {{ t('language.switchTo') }}
            </button>
            <button class="me-ghost-button" type="button" @click="handleLogout">
              {{ t('auth.logout') }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <nav class="me-tabs" :aria-label="t('nav.breadcrumb')">
      <div class="me-tabs-inner" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="me-tab"
          :class="{ active: activeTab === tab.key }"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          @click="switchTab(tab.key)"
        >
          {{ t(tab.labelKey) }}
        </button>
      </div>
    </nav>

    <main class="me-content" :class="{ 'me-content-wide': activeTab === 'messages' }">
      <header class="me-page-heading">
        <h1>{{ t(activeTab === 'wechat' ? 'me.nav.wechat' : 'me.nav.messages') }}</h1>
        <p>{{ t(activeTab === 'wechat' ? 'portal.tagline' : 'me.posts.description') }}</p>
      </header>
      <ToastNotice :message="notice" :danger="noticeDanger" />
      <p v-if="activeTab === 'wechat' && bindingUnavailable" class="inline-alert" role="status">
        {{ t('wechat.statusUnavailable') }}
      </p>

      <div v-if="activeTab === 'wechat'" class="me-wechat-layout" :class="{ 'is-bound': hasBinding }">
        <section class="me-card me-connection-card">
          <header class="me-card-head">
            <div class="me-card-title">
              <span class="me-card-icon me-card-icon-wechat" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8.5 4.5c-3.6 0-6.5 2.4-6.5 5.4 0 1.7.9 3.2 2.4 4.2l-.6 2 2.3-1.2c.8.2 1.6.3 2.4.3" />
                  <path d="M15 9.5c-3.3 0-6 2.2-6 5s2.7 5 6 5c.7 0 1.4-.1 2-.3l2.1 1.1-.5-1.8c1.4-1 2.4-2.4 2.4-4 0-2.8-2.7-5-6-5z" />
                </svg>
              </span>
              <div>
                <h2>{{ t('portal.wechatTitle') }}</h2>
                <p>{{ t('portal.wechatDescription') }}</p>
              </div>
            </div>
            <span v-if="binding !== null" class="me-chip-status" :class="hasBinding ? 'ok' : 'muted'">
              {{ hasBinding ? t('portal.connected') : t('portal.notConnected') }}
            </span>
          </header>

          <div v-if="binding === null" class="me-empty" role="status">
            <p>{{ t(bindingLoading ? 'portal.loading' : 'portal.loadFailed') }}</p>
            <button v-if="!bindingLoading" type="button" @click="loadBinding">{{ t('actions.refresh') }}</button>
          </div>

          <div v-else-if="!hasBinding" class="me-bind">
            <p class="me-bind-intro">{{ t('portal.emptyHint') }}</p>
            <ol class="me-bind-steps">
              <li>{{ t('me.bind.step1') }}</li>
              <li>{{ t('me.bind.step2') }}</li>
            </ol>
            <button class="me-primary" type="button" :disabled="busy || loginPending || bindingUnavailable" @click="startBind">
              {{ t('portal.bindAction') }}
            </button>
          </div>

          <template v-else>
            <div class="me-account">
              <div class="me-account-main">
                <span class="me-account-label">{{ t('portal.boundWechat') }}</span>
                <code class="me-account-id" :title="boundAccount?.accountId">{{ boundAccount?.accountId }}</code>
              </div>
              <button class="me-link-button" type="button" :disabled="busy || bindingUnavailable" @click="accountToUnbind = boundAccount">
                {{ t('portal.unbindAction') }}
              </button>
            </div>

            <div
              v-if="bindingUnavailable || boundAccount?.enabled === false || sessionActive"
              class="me-status"
              :class="sessionActive && boundAccount?.enabled ? 'ok' : 'warn'"
            >
              <span class="me-status-dot" aria-hidden="true"></span>
              <span>{{ sessionStateLabel }}</span>
            </div>
            <div v-else-if="boundAccount?.sessionInvalidated === true" class="me-bind-guide danger" role="status">
              <span class="me-card-icon me-card-icon-wechat" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8.5 4.5c-3.6 0-6.5 2.4-6.5 5.4 0 1.7.9 3.2 2.4 4.2l-.6 2 2.3-1.2c.8.2 1.6.3 2.4.3" />
                  <path d="M15 9.5c-3.3 0-6 2.2-6 5s2.7 5 6 5c.7 0 1.4-.1 2-.3l2.1 1.1-.5-1.8c1.4-1 2.4-2.4 2.4-4 0-2.8-2.7-5-6-5z" />
                </svg>
              </span>
              <span class="me-bind-guide-text">
                <strong>{{ t('me.bind.invalidated') }}</strong>
                <small>{{ t('me.bind.invalidatedHint') }}</small>
              </span>
              <button class="me-link-button" type="button" :disabled="busy || bindingUnavailable || qrVisible" @click="startBind">
                {{ t('portal.bindAction') }}
              </button>
            </div>
            <div v-else class="me-bind-guide" role="status">
              <span class="me-card-icon me-card-icon-wechat" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8.5 4.5c-3.6 0-6.5 2.4-6.5 5.4 0 1.7.9 3.2 2.4 4.2l-.6 2 2.3-1.2c.8.2 1.6.3 2.4.3" />
                  <path d="M15 9.5c-3.3 0-6 2.2-6 5s2.7 5 6 5c.7 0 1.4-.1 2-.3l2.1 1.1-.5-1.8c1.4-1 2.4-2.4 2.4-4 0-2.8-2.7-5-6-5z" />
                </svg>
              </span>
              <span class="me-bind-guide-text">
                <strong>{{ t('me.bind.waitingMessage') }}</strong>
                <small>{{ t('me.bind.hintAfterScan') }}</small>
              </span>
            </div>

            <div v-if="!bindingUnavailable" class="me-quota">
              <div class="me-quota-head">
                <span class="me-quota-label">{{ t('me.quota.title') }}</span>
                <span class="me-quota-value" :class="{ full: quotaFull }">
                  <b>{{ quotaCount }}</b><i>/{{ quotaLimit }}</i>
                </span>
              </div>
              <div class="me-quota-bar">
                <span class="me-quota-fill" :class="{ full: quotaFull }" :style="{ width: quotaPercent }"></span>
              </div>
              <p class="me-quota-hint">{{ quotaFull ? t('me.quota.full') : t('me.quota.resetHint') }}</p>
            </div>
          </template>

          <div v-if="loginPending && !bindingUnavailable" class="me-qr">
            <div v-if="loginStatus === 'scanned'" class="me-bind-guide" role="status">
              <span class="me-card-icon me-card-icon-wechat" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8.5 4.5c-3.6 0-6.5 2.4-6.5 5.4 0 1.7.9 3.2 2.4 4.2l-.6 2 2.3-1.2c.8.2 1.6.3 2.4.3" />
                  <path d="M15 9.5c-3.3 0-6 2.2-6 5s2.7 5 6 5c.7 0 1.4-.1 2-.3l2.1 1.1-.5-1.8c1.4-1 2.4-2.4 2.4-4 0-2.8-2.7-5-6-5z" />
                </svg>
              </span>
              <span class="me-bind-guide-text">
                <strong>{{ t('me.bind.confirmOnPhone') }}</strong>
                <small>{{ t('me.bind.hintAfterScan') }}</small>
              </span>
            </div>
            <template v-else>
              <p class="me-qr-hint">{{ t(qrVisible ? 'portal.scanHint' : 'portal.qrLoading') }}</p>
              <img v-if="qrDataUrl !== null" :src="qrDataUrl" alt="WeChat login QR" class="wechat-qr-image" />
              <a v-if="qrUrl !== null" :href="qrUrl" rel="noreferrer" target="_blank">{{ t('portal.openQrLink') }}</a>
              <p class="me-bind-hint">{{ t('me.bind.hintAfterScan') }}</p>
            </template>
            <form v-if="loginStatus === 'need-code'" class="me-code-form" @submit.prevent="submitCode">
              <label>
                <span>{{ t('portal.codeLabel') }}</span>
                <input v-model="codeInput" autocomplete="off" :placeholder="t('portal.codePlaceholder')" />
              </label>
              <button class="me-primary" type="submit" :disabled="busy">{{ t('portal.submitCode') }}</button>
            </form>
            <button class="me-ghost-button" type="button" :disabled="busy" @click="cancelBind">{{ t('portal.cancelBind') }}</button>
          </div>
        </section>

        <section v-if="hasBinding" class="me-card me-settings-card">
          <header class="me-card-head">
            <div class="me-card-title">
              <span class="me-card-icon me-card-icon-settings" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </span>
              <div>
                <h2>{{ t('portal.settingsTitle') }}</h2>
                <p>{{ t('portal.settingsDescription') }}</p>
              </div>
            </div>
          </header>

          <div class="me-settings-group">
            <p class="me-settings-group-head">
              <span class="me-card-icon me-card-icon-quiet" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
                </svg>
              </span>
              <span class="me-settings-group-text">
                <strong>{{ t('portal.quietTitle') }}</strong>
                <small>{{ t('portal.quietDescription') }}</small>
              </span>
            </p>
            <div class="me-row">
              <span class="me-settings-row-label">{{ t('portal.quietTitle') }}</span>
              <button
                class="me-switch"
                :class="{ on: quietEnabled }"
                type="button"
                role="switch"
                :aria-checked="quietEnabled"
                :aria-label="t('portal.quietTitle')"
                :disabled="busy"
                @click="toggleQuietHours"
              >
                <span class="me-switch-knob"></span>
              </button>
            </div>

            <div v-if="quietEnabled" class="me-quiet-range">
              <label>
                <span>{{ t('portal.quietStart') }}</span>
                <select v-model.number="quietStartHour" :disabled="busy" @change="saveQuietHours()">
                  <option v-for="hour in hourOptions" :key="`start-${hour}`" :value="hour">
                    {{ formatHour(hour) }}
                  </option>
                </select>
              </label>
              <span class="me-quiet-sep">→</span>
              <label>
                <span>{{ t('portal.quietEnd') }}</span>
                <select v-model.number="quietEndHour" :disabled="busy" @change="saveQuietHours()">
                  <option v-for="hour in hourOptions" :key="`end-${hour}`" :value="hour">
                    {{ formatHour(hour) }}
                  </option>
                </select>
              </label>
              <span class="me-save-state">{{ saveStateLabel }}</span>
            </div>
          </div>

          <div class="me-settings-group">
            <p class="me-settings-group-head">
              <span class="me-card-icon me-card-icon-source" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h10" />
                </svg>
              </span>
              <span class="me-settings-group-text">
                <strong>{{ t('portal.sourcesLabel') }}</strong>
                <small>{{ t('portal.sourcesHint') }}</small>
              </span>
            </p>
            <div class="me-row">
              <div
                class="me-segmented"
                role="radiogroup"
                :aria-label="t('portal.sourcesLabel')"
              >
                <button
                  class="me-segment"
                  :class="{ on: sourcesMode === 'all' }"
                  type="button"
                  role="radio"
                  :aria-checked="sourcesMode === 'all'"
                  :disabled="busy"
                  @click="selectSourcesMode('all')"
                >
                  {{ t('portal.sourcesModeReceiveAll') }}
                </button>
                <button
                  class="me-segment"
                  :class="{ on: sourcesMode === 'packs' }"
                  type="button"
                  role="radio"
                  :aria-checked="sourcesMode === 'packs'"
                  :disabled="busy"
                  @click="selectSourcesMode('packs')"
                >
                  {{ t('portal.sourcesModePacks') }}
                </button>
                <button
                  class="me-segment"
                  :class="{ on: sourcesMode === 'custom' }"
                  type="button"
                  role="radio"
                  :aria-checked="sourcesMode === 'custom'"
                  :disabled="busy"
                  @click="selectSourcesMode('custom')"
                >
                  {{ t('portal.sourcesModeReceiveCustom') }}
                </button>
              </div>
            </div>

            <p class="me-inline-state">
              {{ effectiveSourcesLabel }}
              <template v-if="saveStateLabel.length > 0"> · {{ saveStateLabel }}</template>
            </p>
            <p v-if="sourcesMode === 'packs'" class="me-inline-state">{{ t('portal.sourcesPacksHint') }}</p>

            <div v-if="sourcesMode === 'packs'" class="me-source-pack-list">
              <p v-if="sourcePacks.length === 0" class="me-inline-state">{{ t('portal.sourcesPacksEmpty') }}</p>
              <label
                v-for="pack in sourcePacks"
                :key="pack.id"
                class="me-source-pack-card"
                :class="{
                  empty: pack.sourceCount === 0,
                  off: !pack.enabled,
                  on: selectedPackIds.includes(pack.id),
                }"
              >
                <input
                  type="checkbox"
                  :checked="selectedPackIds.includes(pack.id)"
                  :disabled="busy || !pack.enabled || pack.sourceCount === 0"
                  @change="togglePack(pack.id)"
                />
                <span class="me-source-pack-main">
                  <strong>
                    {{ pack.name }}
                    <span v-if="!pack.enabled" class="me-pack-badge">{{ t('portal.packDisabled') }}</span>
                    <span v-else-if="pack.sourceCount === 0" class="me-pack-badge muted">{{ t('portal.packEmpty') }}</span>
                  </strong>
                  <small v-if="pack.description !== null && pack.description.length > 0">{{ pack.description }}</small>
                  <small class="me-source-pack-meta">
                    {{ t('portal.packMemberCount', { count: pack.sourceCount }) }}<template v-if="packPlatformSummary(pack).length > 0"> · {{ packPlatformSummary(pack) }}</template>
                  </small>
                </span>
              </label>
              <p v-if="sourcePacks.length > 0 && selectedPackIds.length === 0" class="me-inline-state">
                {{ t('portal.sourcesPacksNoneSelected') }}
              </p>
            </div>

            <div v-else-if="sourcesMode === 'custom'" class="me-source-groups">
              <p v-if="groupedSources.length === 0" class="me-inline-state">{{ t('portal.sourcesEmpty') }}</p>
              <section v-for="group in groupedSources" :key="group.key" class="me-source-group">
                <p class="me-source-group-title">{{ group.label }}</p>
                <div class="me-source-chips">
                  <button
                    v-for="source in group.sources"
                    :key="source.id"
                    class="me-source-chip"
                    :class="{ on: selectedSourceIds.includes(source.id) }"
                    :aria-pressed="selectedSourceIds.includes(source.id)"
                    type="button"
                    :disabled="busy"
                    @click="toggleSource(source.id)"
                  >
                    <span class="me-source-chip-badge">{{ platformBadge(source).label }}</span>
                    {{ sourceLabel(source) }}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>

      <template v-else>
        <section class="me-card me-messages-card">
          <header class="me-card-head">
            <h2 class="me-message-count">{{ t('me.posts.total', { total: postsPagination.total }) }}</h2>
            <button class="me-ghost-button" type="button" :disabled="postsLoading" @click="loadPosts(1)">
              {{ t('actions.refresh') }}
            </button>
          </header>

          <form class="me-search" @submit.prevent="applySearch">
            <span class="me-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              v-model="searchInput"
              autocomplete="off"
              :placeholder="t('me.posts.searchPlaceholder')"
              :aria-label="t('me.posts.searchPlaceholder')"
            />
            <button v-if="activeQuery.length > 0" class="me-search-clear" type="button" @click="clearSearch">
              {{ t('me.posts.searchClear') }}
            </button>
            <button class="me-search-submit" type="submit" :disabled="postsLoading">
              {{ t('me.posts.searchAction') }}
            </button>
          </form>

          <div class="me-category-bar" role="radiogroup" :aria-label="t('me.posts.categoryLabel')">
            <button
              v-for="option in categoryOptions"
              :key="option.value"
              class="me-segment"
              :class="{ on: selectedCategory === option.value }"
              type="button"
              role="radio"
              :aria-checked="selectedCategory === option.value"
              :disabled="postsLoading"
              @click="selectCategory(option.value)"
            >
              {{ t(option.labelKey) }}
            </button>
          </div>

          <div v-if="posts.length === 0" class="me-empty me-messages-empty" role="status">
            <svg class="me-empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <rect x="7" y="10" width="34" height="28" rx="5" />
              <path d="m8 14 16 12 16-12" />
            </svg>
            <p>{{ t(postsLoading ? 'me.posts.loading' : postsFailed ? 'me.posts.loadFailed' : activeQuery.length > 0 ? 'me.posts.noResults' : 'me.posts.empty') }}</p>
          </div>

          <div v-else class="me-post-list">
            <article v-for="post in posts" :key="post.id" class="me-post">
              <header class="me-post-head">
                <span class="me-post-source">{{ post.sourceDisplayName ?? post.authorUsername }}</span>
                <time class="me-post-time" :datetime="post.postedAt" :title="formatDateTime(post.postedAt)">
                  {{ formatPostTime(post.postedAt) }}
                </time>
              </header>
              <h3 v-if="post.title" class="me-post-title">{{ post.title }}</h3>
              <p v-if="post.textContent.trim().length > 0" class="me-post-body" :class="{ clamped: isLongPost(post) && !expandedPostIds.has(post.id) }">
                {{ post.textContent }}
              </p>
              <p v-else class="me-post-body me-post-body-empty">{{ t('me.posts.noBody') }}</p>
              <div class="me-post-foot">
                <a class="me-post-link" :href="post.permalinkUrl" rel="noreferrer" target="_blank">
                  {{ t('me.posts.openOriginal') }}
                </a>
                <button
                  v-if="isLongPost(post)"
                  class="me-post-expand"
                  type="button"
                  :aria-expanded="expandedPostIds.has(post.id)"
                  @click="togglePostExpanded(post.id)"
                >
                  {{ expandedPostIds.has(post.id) ? t('me.posts.collapse') : t('me.posts.expand') }}
                </button>
              </div>
            </article>
          </div>

          <nav v-if="posts.length > 0 && postsPagination.totalPages > 1" class="me-pagination" :aria-label="t('me.posts.paginationLabel')">
            <button
              class="me-pagination-nav"
              type="button"
              :disabled="postsLoading || postsPagination.page <= 1"
              :aria-label="t('actions.previousPage')"
              @click="goToPage(postsPagination.page - 1)"
            >
              ‹
            </button>
            <template v-for="item in paginationItems" :key="item.type === 'ellipsis' ? `ellipsis-${item.key}` : `page-${item.key}`">
              <span v-if="item.type === 'ellipsis'" class="me-pagination-ellipsis" aria-hidden="true">…</span>
              <button
                v-else
                class="me-pagination-page"
                :class="{ current: item.page === postsPagination.page }"
                type="button"
                :disabled="postsLoading"
                :aria-current="item.page === postsPagination.page ? 'page' : undefined"
                :aria-label="t('me.posts.pageLabel', { page: item.page })"
                @click="goToPage(item.page)"
              >
                {{ item.page }}
              </button>
            </template>
            <button
              class="me-pagination-nav"
              type="button"
              :disabled="postsLoading || postsPagination.page >= postsPagination.totalPages"
              :aria-label="t('actions.nextPage')"
              @click="goToPage(postsPagination.page + 1)"
            >
              ›
            </button>
          </nav>
        </section>
      </template>
    </main>

    <ConfirmModal
      :body="t('portal.unbindConfirmBody')"
      :open="accountToUnbind !== null"
      :title="t('portal.unbindConfirmTitle')"
      @cancel="accountToUnbind = null"
      @confirm="confirmUnbind"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  cancelMyWechatBind,
  getMyWechatBinding,
  listMyPosts,
  startMyWechatBind,
  submitMyWechatLoginCode,
  unbindMyWechatAccount,
  updateMyWechatQuietHours,
  updateMyWechatSources,
  type MyWechatAccount,
  type MyWechatBinding,
  type MyWechatSource,
  type MyWechatSourcePack,
  type MyWechatSourcesMode,
  type UserPostCategory,
  type UserPostItem,
} from '../api/admin-api';
import { signOut, useAuth } from '../auth';
import BrandLogo from '../components/BrandLogo.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { tBackend, useI18n, type MessageKey } from '../i18n';
import { platformBadge, sourceLabel } from '../source-labels';
import { formatDateTime } from '../utils';

type PortalTabKey = 'messages' | 'wechat';

const { t, toggleLanguage } = useI18n();
const { currentUser } = useAuth();
const router = useRouter();
const accountToUnbind = ref<MyWechatAccount | null>(null);
const activeTab = ref<PortalTabKey>('wechat');
const binding = ref<MyWechatBinding | null>(null);
const bindingLoading = ref(true);
const busy = ref(false);
const codeInput = ref('');
const loginStatus = ref('idle');
const notice = ref('');
const noticeDanger = ref(false);
const posts = ref<UserPostItem[]>([]);
const postsLoading = ref(false);
const postsFailed = ref(false);
const postsPagination = ref({ page: 1, pageSize: 18, total: 0, totalPages: 0 });
const qrDataUrl = ref<string | null>(null);
const qrUrl = ref<string | null>(null);
const bindingRefreshFailed = ref(false);
const bindingUnavailable = computed(() => bindingRefreshFailed.value || binding.value?.login.status === 'unavailable');
const loginPending = computed(() => isPendingLogin(loginStatus.value));
const qrVisible = computed(() => !bindingUnavailable.value && loginPending.value &&
  (qrDataUrl.value !== null || qrUrl.value !== null));
const quietEnabled = ref(false);
const quietEndHour = ref(8);
const quietStartHour = ref(23);
const saveState = ref<'idle' | 'saving' | 'saved'>('idle');
const expandedPostIds = ref(new Set<string>());
const activeQuery = ref('');
const searchInput = ref('');
const selectedCategory = ref<UserPostCategory>('all');
const selectedSourceIds = ref<string[]>([]);
const selectedPackIds = ref<string[]>([]);
const sourcesMode = ref<MyWechatSourcesMode>('all');
let pollTimer: number | null = null;
let saveStateTimer: number | null = null;
let bindingRequestId = 0;
let bindingRefreshing = false;
let disposed = false;

const tabs: Array<{ key: PortalTabKey; labelKey: MessageKey }> = [
  { key: 'wechat', labelKey: 'me.nav.wechat' },
  { key: 'messages', labelKey: 'me.nav.messages' },
];
const categoryOptions: Array<{ labelKey: MessageKey; value: UserPostCategory }> = [
  { labelKey: 'me.posts.category.all', value: 'all' },
  { labelKey: 'me.posts.category.x', value: 'x' },
  { labelKey: 'me.posts.category.youtube', value: 'youtube' },
  { labelKey: 'me.posts.category.blog', value: 'blog' },
  { labelKey: 'me.posts.category.paper', value: 'paper' },
  { labelKey: 'me.posts.category.community', value: 'community' },
];
const hourOptions = Array.from({ length: 24 }, (_, index) => index);
const hasBinding = computed(() => (binding.value?.accounts.length ?? 0) > 0);
const boundAccount = computed<MyWechatAccount | null>(() => binding.value?.accounts[0] ?? null);
const sessionInvalidated = computed(() => boundAccount.value?.sessionInvalidated === true);
const quotaLimit = computed(() => boundAccount.value?.sendLimit ?? 10);
// 会话已在其它环境作废后，旧会话的额度计数不再有意义；重新绑定后额度从 0 开始
const quotaCount = computed(() =>
  sessionInvalidated.value ? 0 : Math.min(boundAccount.value?.sendCount ?? 0, quotaLimit.value),
);
const quotaFull = computed(() => quotaCount.value >= quotaLimit.value);
const quotaPercent = computed(() =>
  quotaLimit.value === 0 ? '0%' : `${Math.min(100, Math.round((quotaCount.value / quotaLimit.value) * 100))}%`,
);
const sessionActive = computed(() => !bindingUnavailable.value && boundAccount.value?.sessionActive === true);
const sessionStateLabel = computed(() =>
  bindingUnavailable.value
    ? t('me.session.unavailable')
    : binding.value === null
      ? t('me.session.checking')
      : boundAccount.value?.enabled === false
        ? t('portal.pushOff')
        : sessionActive.value
          ? t('me.session.active')
          : t('me.session.inactive'),
);
const saveStateLabel = computed(() =>
  saveState.value === 'saving'
    ? t('portal.saving')
    : saveState.value === 'saved'
      ? t('portal.saved')
      : '',
);
const sourcePacks = computed<MyWechatSourcePack[]>(() => binding.value?.sourcePacks ?? []);
const effectiveSourcesLabel = computed(() => {
  if (sourcesMode.value === 'packs') {
    return t('portal.sourcesEffectivePacks', { count: packUnionSize.value });
  }

  if (sourcesMode.value === 'custom') {
    return t('portal.sourcesSelected', { count: selectedSourceIds.value.length });
  }

  return t('portal.sourcesEffectiveAll', { count: binding.value?.sources.length ?? 0 });
});
const packUnionSize = computed(() => {
  const union = new Set<string>();

  for (const pack of sourcePacks.value) {
    if (selectedPackIds.value.includes(pack.id) && pack.enabled) {
      for (const source of pack.sources) {
        union.add(source.id);
      }
    }
  }

  return union.size;
});
const groupedSources = computed(() => {
  const packBySourceId = new Map<string, MyWechatSourcePack>();

  for (const pack of sourcePacks.value) {
    for (const source of pack.sources) {
      packBySourceId.set(source.id, pack);
    }
  }

  const sourcesByPackId = new Map<string, MyWechatSource[]>();
  const ungrouped: MyWechatSource[] = [];

  for (const source of binding.value?.sources ?? []) {
    const pack = packBySourceId.get(source.id);

    if (pack === undefined) {
      ungrouped.push(source);
      continue;
    }

    const list = sourcesByPackId.get(pack.id) ?? [];
    list.push(source);
    sourcesByPackId.set(pack.id, list);
  }

  const groups: Array<{ key: string; label: string; sources: MyWechatSource[] }> = [];

  for (const pack of sourcePacks.value) {
    const list = sourcesByPackId.get(pack.id);

    if (list !== undefined && list.length > 0) {
      groups.push({ key: pack.id, label: pack.name, sources: list });
    }
  }

  if (ungrouped.length > 0) {
    groups.push({ key: 'ungrouped', label: t('portal.sourcesUngrouped'), sources: ungrouped });
  }

  return groups.map((group) => ({
    ...group,
    sources: [...group.sources].sort((left, right) =>
      sourceLabel(left).localeCompare(sourceLabel(right), 'zh-Hans-CN'),
    ),
  }));
});
type PaginationItem = { type: 'page'; page: number; key: number } | { type: 'ellipsis'; key: number };
const paginationItems = computed<PaginationItem[]>(() => {
  const totalPages = postsPagination.value.totalPages;
  const current = postsPagination.value.page;

  if (totalPages <= 1) {
    return [];
  }

  const pages = new Set<number>([1, totalPages, current - 1, current, current + 1]);
  const items: PaginationItem[] = [];
  let previous = 0;

  for (const page of [...pages].filter((value) => value >= 1 && value <= totalPages).sort((left, right) => left - right)) {
    if (previous > 0 && page - previous > 1) {
      items.push({ type: 'ellipsis', key: previous });
    }

    items.push({ type: 'page', page, key: page });
    previous = page;
  }

  return items;
});

onMounted(() => {
  void loadBinding();
  startPolling();
  void loadPosts(1);
});

onBeforeUnmount(() => {
  disposed = true;
  stopPolling();
  stopSaveStateTimer();
});

function switchTab(tab: PortalTabKey): void {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  if (tab === 'wechat') {
    void refreshBindStatus();
    startPolling();
  } else {
    stopPolling();
  }
}

async function loadBinding(): Promise<void> {
  bindingLoading.value = true;

  await refreshBindStatus(true);
  bindingLoading.value = false;
}

function syncBindingState(previous: MyWechatAccount | null, resetSettings: boolean): void {
  const account = boundAccount.value;
  const accountChanged = previous?.accountId !== account?.accountId;
  const snapshot = (entry: MyWechatAccount | null): string =>
    JSON.stringify({
      mode: entry?.mode ?? 'all',
      packIds: entry?.packIds ?? [],
      sourceIds: entry?.sourceIds ?? [],
    });

  // A status poll must not reset the unsaved choice while the server state is unchanged.
  if (resetSettings || accountChanged || snapshot(previous) !== snapshot(account)) {
    selectedSourceIds.value = [...(account?.sourceIds ?? [])];
    selectedPackIds.value = [...(account?.packIds ?? [])];
    sourcesMode.value = account?.mode ?? 'all';
  }
  if (resetSettings || accountChanged || JSON.stringify(previous?.quietHours) !== JSON.stringify(account?.quietHours)) {
    quietEnabled.value = account?.quietHours?.enabled === true;
    quietStartHour.value = account?.quietHours?.startHour ?? 23;
    quietEndHour.value = account?.quietHours?.endHour ?? 8;
  }
  if (accountChanged) accountToUnbind.value = null;
}

async function loadPosts(page: number): Promise<void> {
  postsLoading.value = true;
  postsFailed.value = false;

  try {
    const result = await listMyPosts(
      page,
      postsPagination.value.pageSize,
      activeQuery.value,
      selectedCategory.value,
    );

    posts.value = result.posts;
    postsPagination.value = result.pagination;
  } catch (error) {
    postsFailed.value = true;
    showError(error);
  } finally {
    postsLoading.value = false;
  }
}

async function selectCategory(category: UserPostCategory): Promise<void> {
  if (selectedCategory.value === category) return;

  selectedCategory.value = category;
  expandedPostIds.value = new Set();
  await loadPosts(1);
}

function applySearch(): void {
  activeQuery.value = searchInput.value.trim();
  expandedPostIds.value = new Set();
  void loadPosts(1);
}

async function goToPage(page: number): Promise<void> {
  if (page < 1 || page > postsPagination.value.totalPages || page === postsPagination.value.page) {
    return;
  }

  expandedPostIds.value = new Set();
  await loadPosts(page);
}

function clearSearch(): void {
  searchInput.value = '';
  activeQuery.value = '';
  expandedPostIds.value = new Set();
  void loadPosts(1);
}

async function startBind(): Promise<void> {
  beginBindingOperation();
  notice.value = '';

  try {
    const state = await startMyWechatBind();
    if (disposed) return;

    qrDataUrl.value = state.qrcodeDataUrl ?? null;
    qrUrl.value = state.qrcodeUrl ?? null;
    loginStatus.value = state.status;
    await refreshBindStatus();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

function startPolling(): void {
  if (pollTimer !== null || disposed) return;
  pollTimer = window.setInterval(() => {
    if (!busy.value && !bindingRefreshing && !bindingLoading.value) void refreshBindStatus();
  }, 3000);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  invalidateBindingRequest();
}

function invalidateBindingRequest(): void {
  bindingRequestId++;
  bindingRefreshing = false;
}

function beginBindingOperation(): void {
  busy.value = true;
  invalidateBindingRequest();
}

function isPendingLogin(status: string): boolean {
  return ['pending', 'scanned', 'need-code'].includes(status);
}

async function refreshBindStatus(resetSettings = false): Promise<void> {
  if (disposed || activeTab.value !== 'wechat') return;
  const requestId = ++bindingRequestId;
  bindingRefreshing = true;
  try {
    const next = await getMyWechatBinding();
    if (requestId !== bindingRequestId || disposed) return;
    const previousAccount = boundAccount.value;
    const wasPending = isPendingLogin(loginStatus.value);
    const loginChanged = loginStatus.value !== next.login.status || binding.value?.login.message !== next.login.message;

    binding.value = next;
    bindingRefreshFailed.value = false;
    loginStatus.value = next.login.status;
    qrDataUrl.value = next.login.qrcodeDataUrl ?? null;
    qrUrl.value = next.login.qrcodeUrl ?? null;
    syncBindingState(previousAccount, resetSettings);

    if ((next.login.status === 'failed' && loginChanged) || (wasPending && next.login.status === 'idle' && next.accounts.length === 0)) {
      noticeDanger.value = true;
      notice.value = tBackend(next.login.message ?? t('portal.bindFailed'));
    } else if (wasPending && next.accounts.length > 0 && !isPendingLogin(next.login.status) && next.login.status !== 'unavailable') {
      noticeDanger.value = false;
      notice.value = t('portal.bindSuccess');
    }
  } catch {
    if (requestId === bindingRequestId && !disposed) {
      bindingRefreshFailed.value = true;
    }
  } finally {
    if (requestId === bindingRequestId) bindingRefreshing = false;
  }
}

async function submitCode(): Promise<void> {
  beginBindingOperation();

  try {
    await submitMyWechatLoginCode(codeInput.value.trim());
    codeInput.value = '';
    await refreshBindStatus();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function cancelBind(): Promise<void> {
  beginBindingOperation();
  try {
    await cancelMyWechatBind();
    if (disposed) return;
    loginStatus.value = 'idle';
    codeInput.value = '';
    await refreshBindStatus();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function toggleQuietHours(): Promise<void> {
  quietEnabled.value = !quietEnabled.value;
  await saveQuietHours();
}

async function saveQuietHours(): Promise<void> {
  const account = boundAccount.value;

  if (account === null) {
    return;
  }

  beginBindingOperation();
  markSaving();

  try {
    const result = await updateMyWechatQuietHours(account.accountId, {
      enabled: quietEnabled.value,
      endHour: quietEndHour.value,
      startHour: quietStartHour.value,
    });

    quietEnabled.value = result?.enabled === true;
    quietStartHour.value = result?.startHour ?? quietStartHour.value;
    quietEndHour.value = result?.endHour ?? quietEndHour.value;
    account.quietHours = result;
    markSaved();
  } catch (error) {
    saveState.value = 'idle';
    showError(error);
    await loadBinding();
  } finally {
    busy.value = false;
  }
}

async function selectSourcesMode(next: MyWechatSourcesMode): Promise<void> {
  if (next === sourcesMode.value) {
    return;
  }

  if (next === 'all') {
    sourcesMode.value = 'all';
    await saveSourcesAll();
    return;
  }

  // 「按主题包」先展示包卡片，勾选即保存；「自定义」仅切换不保存（现状语义）。
  sourcesMode.value = next;
}

async function togglePack(packId: string): Promise<void> {
  if (selectedPackIds.value.includes(packId)) {
    selectedPackIds.value = selectedPackIds.value.filter((id) => id !== packId);
  } else {
    selectedPackIds.value = [...selectedPackIds.value, packId];
  }

  await saveSourcesPacks();
}

async function toggleSource(sourceId: string): Promise<void> {
  if (selectedSourceIds.value.includes(sourceId)) {
    selectedSourceIds.value = selectedSourceIds.value.filter((id) => id !== sourceId);
  } else {
    selectedSourceIds.value = [...selectedSourceIds.value, sourceId];
  }

  if (selectedSourceIds.value.length === 0) {
    sourcesMode.value = 'all';
    noticeDanger.value = false;
    notice.value = t('portal.sourcesAllRestored');
    await saveSources({ sourceIds: [] });

    return;
  }

  await saveSources({ mode: 'custom', sourceIds: [...selectedSourceIds.value] });
}

async function saveSourcesPacks(): Promise<void> {
  await saveSources({ mode: 'packs', packs: [...selectedPackIds.value] });
}

async function saveSourcesAll(): Promise<void> {
  await saveSources({ mode: 'all' });
}

async function saveSources(input: {
  mode?: 'all' | 'custom' | 'packs';
  packs?: string[];
  sourceIds?: string[];
}): Promise<void> {
  const account = boundAccount.value;

  if (account === null) {
    return;
  }

  beginBindingOperation();
  markSaving();

  try {
    const saved = await updateMyWechatSources(account.accountId, input);

    selectedPackIds.value = [...saved.packs];
    selectedSourceIds.value = [...saved.sourceIds];
    sourcesMode.value = saved.mode;
    account.packIds = [...saved.packs];
    account.sourceIds = [...saved.sourceIds];
    account.mode = saved.mode;
    markSaved();
  } catch (error) {
    saveState.value = 'idle';
    showError(error);
    await loadBinding();
  } finally {
    busy.value = false;
  }
}

async function confirmUnbind(): Promise<void> {
  const account = accountToUnbind.value;

  accountToUnbind.value = null;

  if (account === null) {
    return;
  }

  beginBindingOperation();
  notice.value = '';

  try {
    const deleted = await unbindMyWechatAccount(account.accountId);
    noticeDanger.value = false;
    notice.value = t(deleted ? 'portal.unbindSuccess' : 'portal.bindingGone');
    await loadBinding();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

function packPlatformSummary(pack: MyWechatSourcePack): string {
  const labels: string[] = [];

  for (const source of pack.sources) {
    const badge = platformBadge(source);

    if (!labels.includes(badge.label)) {
      labels.push(badge.label);
    }
  }

  return labels.join(' · ');
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatPostTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (input: number) => String(input).padStart(2, '0');

  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isLongPost(post: UserPostItem): boolean {
  return post.textContent.length > 140 || post.textContent.split('\n').length > 4;
}

function togglePostExpanded(postId: string): void {
  const next = new Set(expandedPostIds.value);

  if (next.has(postId)) {
    next.delete(postId);
  } else {
    next.add(postId);
  }

  expandedPostIds.value = next;
}

function markSaving(): void {
  stopSaveStateTimer();
  saveState.value = 'saving';
}

function markSaved(): void {
  if (disposed) return;
  saveState.value = 'saved';
  stopSaveStateTimer();
  saveStateTimer = window.setTimeout(() => {
    saveState.value = 'idle';
  }, 2500);
}

function stopSaveStateTimer(): void {
  if (saveStateTimer !== null) {
    window.clearTimeout(saveStateTimer);
    saveStateTimer = null;
  }
}

async function handleLogout(): Promise<void> {
  await signOut();
  await router.push('/login');
}

function showError(error: unknown): void {
  noticeDanger.value = true;
  notice.value = error instanceof Error ? error.message : String(error);
}
</script>
