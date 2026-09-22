<template>
  <section class="page-fit">
    <PageHeader :subtitle="t('accounts.subtitle')" :title="t('nav.accounts')">
      <button class="primary" type="button" :aria-expanded="newSourceOpen" aria-controls="source-create-panel" @click="newSourceOpen = !newSourceOpen">{{ t(newSourceOpen ? 'actions.cancel' : 'accounts.addSource') }}</button>
    </PageHeader>

    <ToastNotice :message="notice" :danger="noticeDanger" />

    <div v-if="newSourceOpen" id="source-create-panel" class="panel source-create-panel">
      <header class="panel-header"><div><h2>{{ t('accounts.addSource') }}</h2><p>{{ t('accounts.sourceEntryHint') }}</p></div></header>
      <form class="panel-toolbar source-add-toolbar" @submit.prevent="addAccount">
        <div class="source-add-fields">
          <SelectControl
            v-model="sourceKind"
            :aria-label="t('accounts.sourceType')"
            :disabled="addingAccount"
            :options="sourceKindOptions"
          />
          <input
            v-if="sourceKind === 'x'"
            v-model="username"
            autocomplete="off"
            :disabled="addingAccount"
            :placeholder="t('accounts.placeholder')"
            :aria-label="t('accounts.placeholder')"
          />
          <input
            v-else-if="sourceKind === 'rss'"
            v-model="rssUrl"
            autocomplete="off"
            :disabled="addingAccount"
            :placeholder="t('accounts.rssPlaceholder')"
            :aria-label="t('accounts.rssPlaceholder')"
          />
          <input
            v-else-if="sourceKind === 'youtube'"
            v-model="youtubeInput"
            autocomplete="off"
            :disabled="addingAccount"
            :placeholder="t('accounts.youtubePlaceholder')"
            :aria-label="t('accounts.youtubePlaceholder')"
          />
          <template v-else-if="sourceKind === 'reddit'">
            <input
              v-model="redditName"
              autocomplete="off"
              :disabled="addingAccount"
              :placeholder="t('accounts.redditPlaceholder')"
            :aria-label="t('accounts.redditPlaceholder')"
            />
            <SelectControl
              v-model="redditSort"
              :aria-label="t('accounts.redditSortLabel')"
              :disabled="addingAccount"
              :options="redditSortOptions"
            />
          </template>
          <SelectControl
            v-else-if="sourceKind === 'arxiv'"
            v-model="arxivCategory"
            :aria-label="t('accounts.arxivCategoryLabel')"
            :disabled="addingAccount"
            :options="arxivCategoryOptions"
          />
          <SelectControl
            v-else-if="sourceKind === 'hackernews'"
            v-model="hnPreset"
            :aria-label="t('accounts.hnPresetLabel')"
            :disabled="addingAccount"
            :options="hnPresetOptions"
          />
          <template v-else-if="sourceKind === 'github'">
            <SelectControl
              v-model="githubMode"
              :aria-label="t('accounts.githubModeLabel')"
              :disabled="addingAccount"
              :options="githubModeOptions"
            />
            <template v-if="githubMode === 'trending'">
              <SelectControl
                v-model="githubPeriod"
                :aria-label="t('accounts.githubPeriodLabel')"
                :disabled="addingAccount"
                :options="githubPeriodOptions"
              />
              <input
                v-model="githubLanguage"
                autocomplete="off"
                :disabled="addingAccount"
                :placeholder="t('accounts.githubLanguagePlaceholder')"
            :aria-label="t('accounts.githubLanguagePlaceholder')"
              />
            </template>
            <input
              v-else-if="githubMode === 'releases'"
              v-model="githubRepo"
              autocomplete="off"
              :disabled="addingAccount"
              :placeholder="t('accounts.githubRepoPlaceholder')"
            :aria-label="t('accounts.githubRepoPlaceholder')"
            />
            <input
              v-else
              v-model="githubUser"
              autocomplete="off"
              :disabled="addingAccount"
              :placeholder="t('accounts.githubUserPlaceholder')"
            :aria-label="t('accounts.githubUserPlaceholder')"
            />
          </template>
          <template v-else-if="sourceKind === 'hf'">
            <span class="muted source-add-inline-hint">{{ t('accounts.hfPapersHint') }}</span>
          </template>
          <template v-else-if="sourceKind === 'anthropic'">
            <span class="muted source-add-inline-hint">{{ t('accounts.anthropicHint') }}</span>
          </template>
          <template v-else-if="sourceKind === 'ai2'">
            <span class="muted source-add-inline-hint">{{ t('accounts.ai2Hint') }}</span>
          </template>
          <template v-else-if="sourceKind === 'moonshot'">
            <span class="muted source-add-inline-hint">{{ t('accounts.moonshotHint') }}</span>
          </template>
          <template v-else-if="sourceKind === 'meta'">
            <span class="muted source-add-inline-hint">{{ t('accounts.metaHint') }}</span>
          </template>
          <template v-else-if="sourceKind === 'xai'">
            <span class="muted source-add-inline-hint">{{ t('accounts.xaiHint') }}</span>
          </template>
          <span v-else class="muted source-add-inline-hint">
            {{ t('accounts.producthuntHint') }}
          </span>
          <button class="primary" type="submit" :disabled="busy || addingAccount">
            {{ addingAccount ? t('accounts.validating') : t('accounts.add') }}
          </button>
        </div>
        <small v-if="pendingFeedUrl !== null" class="source-add-preview">
          {{ t('accounts.addPreview', { url: pendingFeedUrl }) }}
        </small>
      </form>
    </div>

    <div class="panel accounts-list-panel">
      <form class="panel-toolbar query-form" @submit.prevent="applyQuery">
        <input
          v-model="queryInput"
          :aria-label="t('accounts.queryLabel')"
          autocomplete="off"
          class="query-input"
          :disabled="busy"
          :placeholder="t('accounts.queryPlaceholder')"
        />
        <button type="submit" :disabled="busy">{{ t('actions.query') }}</button>
        <button type="button" :disabled="busy" @click="clearQuery">{{ t('accounts.clearQuery') }}</button>
        <span class="spacer"></span>
        <button
          v-if="pagination.total > 0"
          class="text-button danger-text accounts-delete-all"
          type="button"
          :disabled="busy"
          @click="deleteAllOpen = true"
        >
          {{ t('accounts.deleteAll') }}
        </button>
      </form>
      <EmptyState
        v-if="accounts.length === 0"
        :title="t('accounts.emptyTitle')"
        :description="t('accounts.empty')"
      />
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('table.source') }}</th>
              <th>{{ t('table.lastPolledAt') }}</th>
              <th>{{ t('table.lastPollStatus') }}</th>
              <th>{{ t('table.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="account in accounts" :key="account.id">
              <td>
                <strong class="source-cell-title">
                  <span class="status-badge neutral source-type-badge">
                    {{ sourceBadge(account) }}
                  </span>
                  <span class="source-cell-name">{{ sourceLabel(account) }}</span>
                  <span v-if="sourceSubtitle(account).length > 0" class="muted source-cell-subtitle">
                    {{ sourceSubtitle(account) }}
                  </span>
                </strong>
              </td>
              <td :title="formatDateTime(account.lastPolledAt)">
                {{ formatRelativeTime(account.lastPolledAt) }}
              </td>
              <td><StatusBadge :status="account.lastPollStatus" /></td>
              <td class="source-actions-cell">
                <button class="text-button danger-text" type="button" :disabled="busy" @click="askDelete(account)">
                  {{ t('actions.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationBar
        :busy="busy"
        :pagination="pagination"
        @change-page="loadAccounts"
        @invalid-page="setNotice(t('notice.invalidPage'), true)"
      />
    </div>

    <div class="panel source-packs-panel">
      <header class="panel-header">
        <div>
          <h2>{{ t('accounts.packs.title') }}</h2>
          <p>{{ t('accounts.packs.description') }}</p>
        </div>
        <button
          class="primary"
          type="button"
          :aria-expanded="packEditorOpen"
          :disabled="packBusy"
          @click="openPackEditor()"
        >
          {{ t('accounts.packs.create') }}
        </button>
      </header>

      <div v-if="packEditorOpen" class="panel pack-editor-panel">
        <form class="pack-editor" @submit.prevent="savePack">
          <label class="pack-editor-field">
            <span>{{ t('accounts.packs.nameLabel') }}</span>
            <input
              v-model="packNameInput"
              autocomplete="off"
              :disabled="packBusy"
              maxlength="100"
              :placeholder="t('accounts.packs.namePlaceholder')"
            />
          </label>
          <label class="pack-editor-field">
            <span>{{ t('accounts.packs.descriptionLabel') }}</span>
            <input
              v-model="packDescriptionInput"
              autocomplete="off"
              :disabled="packBusy"
              maxlength="500"
              :placeholder="t('accounts.packs.descriptionPlaceholder')"
            />
          </label>
          <div class="pack-editor-members">
            <div class="pack-editor-members-head">
              <strong>{{ t('accounts.packs.membersTitle', { count: packMemberIds.length }) }}</strong>
              <span v-if="packSelectedNames.length > 0" class="muted">{{ packSelectedNames.join('、') }}</span>
            </div>
            <input
              v-model="packMemberQuery"
              autocomplete="off"
              class="pack-member-search"
              :disabled="packBusy"
              :placeholder="t('accounts.packs.memberSearchPlaceholder')"
            />
            <p v-if="packMemberGroups.length === 0" class="muted pack-member-empty">
              {{ t('accounts.packs.memberSearchEmpty') }}
            </p>
            <ul v-else class="pack-member-list">
              <template v-for="group in packMemberGroups" :key="group.key">
                <li class="pack-member-group-title">{{ t(group.labelKey) }}</li>
                <li v-for="account in group.sources" :key="account.id">
                  <label class="pack-member-row">
                    <input
                      type="checkbox"
                      :checked="packMemberIds.includes(account.id)"
                      :disabled="packBusy"
                      @change="togglePackMember(account.id)"
                    />
                    <span class="status-badge neutral source-type-badge">{{ sourceBadge(account) }}</span>
                    <span class="pack-member-name">{{ sourceLabel(account) }}</span>
                    <span v-if="sourceSubtitle(account).length > 0" class="muted source-cell-subtitle">
                      {{ sourceSubtitle(account) }}
                    </span>
                  </label>
                </li>
              </template>
            </ul>
          </div>
          <div class="pack-editor-actions">
            <button class="primary" type="submit" :disabled="packBusy || packNameInput.trim().length === 0">
              {{ t(packEditingId === null ? 'accounts.packs.create' : 'actions.saveEdit') }}
            </button>
            <button type="button" :disabled="packBusy" @click="closePackEditor">{{ t('actions.cancel') }}</button>
          </div>
        </form>
      </div>

      <EmptyState
        v-if="sourcePacks.length === 0"
        :title="t('accounts.packs.emptyTitle')"
        :description="t('accounts.packs.empty')"
      />
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('accounts.packs.nameLabel') }}</th>
              <th>{{ t('accounts.packs.sourceCount') }}</th>
              <th>{{ t('accounts.packs.selectedByUsers') }}</th>
              <th>{{ t('settings.feishu.table.enabled') }}</th>
              <th>{{ t('table.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(pack, index) in sourcePacks" :key="pack.id" :class="{ 'pack-row-disabled': !pack.enabled }">
              <td>
                <strong>{{ pack.name }}</strong>
                <span v-if="!pack.enabled" class="status-badge neutral pack-disabled-badge">{{ t('accounts.packs.disabled') }}</span>
                <p class="muted pack-description">{{ pack.description }}</p>
              </td>
              <td>{{ pack.sourceCount }}</td>
              <td>{{ pack.selectedByUsers }}</td>
              <td>
                <button
                  class="me-switch"
                  :class="{ on: pack.enabled }"
                  type="button"
                  role="switch"
                  :aria-checked="pack.enabled"
                  :aria-label="t('accounts.packs.toggleEnabled', { name: pack.name })"
                  :disabled="packBusy"
                  @click="togglePackEnabled(pack)"
                >
                  <span class="me-switch-knob"></span>
                </button>
              </td>
              <td class="source-actions-cell">
                <button
                  class="text-button"
                  type="button"
                  :disabled="packBusy || index === 0"
                  @click="movePack(pack, -1)"
                >
                  {{ t('accounts.packs.moveUp') }}
                </button>
                <button
                  class="text-button"
                  type="button"
                  :disabled="packBusy || index === sourcePacks.length - 1"
                  @click="movePack(pack, 1)"
                >
                  {{ t('accounts.packs.moveDown') }}
                </button>
                <button class="text-button" type="button" :disabled="packBusy" @click="openPackEditor(pack)">
                  {{ t('actions.edit') }}
                </button>
                <button class="text-button danger-text" type="button" :disabled="packBusy" @click="packDeleteTarget = pack">
                  {{ t('actions.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ConfirmModal
      :open="deleteTarget !== null"
      :title="t('accounts.deleteTitle')"
      :body="deleteTarget === null ? '' : sourceLabel(deleteTarget)"
      :detail="t('accounts.deleteBody')"
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />

    <ConfirmModal
      :open="packDeleteTarget !== null"
      :title="t('accounts.packs.deleteTitle')"
      :body="packDeleteTarget?.name ?? ''"
      :detail="t('accounts.packs.deleteBody', { count: packDeleteTarget?.selectedByUsers ?? 0 })"
      @cancel="packDeleteTarget = null"
      @confirm="confirmPackDelete"
    />

    <ConfirmModal
      :open="deleteAllOpen"
      :title="t('accounts.deleteAllTitle')"
      :body="t('accounts.deleteAllBody', { count: pagination.total })"
      @cancel="deleteAllOpen = false"
      @confirm="confirmDeleteAll"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import {
  AdminApiRequestError,
  createSourcePack,
  createWatchAccount,
  deleteAllWatchAccounts,
  deleteSourcePack,
  deleteWatchAccount,
  listSourcePacks,
  listWatchAccounts,
  resolveYoutubeChannel,
  updateSourcePack,
  type AdminPagination,
  type ResolvedYoutubeChannel,
  type SourcePackView,
  type WatchAccount,
} from '../api/admin-api';
import ConfirmModal from '../components/ConfirmModal.vue';
import EmptyState from '../components/EmptyState.vue';
import PageHeader from '../components/PageHeader.vue';
import PaginationBar from '../components/PaginationBar.vue';
import SelectControl from '../components/SelectControl.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t } from '../i18n';
import {
  SOURCE_GROUP_LABEL_KEYS,
  SOURCE_GROUP_ORDER,
  sourceGroup,
  sourceLabel,
  sourceSubtitle,
  type SourceGroupKey,
} from '../source-labels';
import { DEFAULT_PAGE_SIZE, formatDateTime, formatRelativeTime } from '../utils';

type SourceKind =
  | 'x'
  | 'rss'
  | 'youtube'
  | 'reddit'
  | 'arxiv'
  | 'hackernews'
  | 'producthunt'
  | 'github'
  | 'hf'
  | 'anthropic'
  | 'ai2'
  | 'moonshot'
  | 'meta'
  | 'xai';
type RedditSort = 'hot' | 'new' | 'top';
type HackerNewsPreset = 'frontpage' | 'newest' | 'points100' | 'points300';
type GithubMode = 'trending' | 'releases' | 'activity';
type GithubPeriod = 'daily' | 'weekly' | 'monthly';

const HN_PRESET_URLS: Record<HackerNewsPreset, string> = {
  frontpage: 'https://hnrss.org/frontpage',
  newest: 'https://hnrss.org/newest',
  points100: 'https://hnrss.org/newest?points=100',
  points300: 'https://hnrss.org/newest?points=300',
};
const YOUTUBE_FEED_PREFIX = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,}$/u;
const REDDIT_NAME_PATTERN = /^[A-Za-z0-9_]{2,21}$/u;

const newSourceOpen = ref(false);
const accounts = ref<WatchAccount[]>([]);
const sourcePacks = ref<SourcePackView[]>([]);
const packEditorOpen = ref(false);
const packEditingId = ref<string | null>(null);
const packNameInput = ref('');
const packDescriptionInput = ref('');
const packMemberQuery = ref('');
const packMemberIds = ref<string[]>([]);
const packMemberResults = ref<WatchAccount[]>([]);
const packBusy = ref(false);
const packDeleteTarget = ref<SourcePackView | null>(null);
const activeQuery = ref('');
const addingAccount = ref(false);
const busy = ref(false);
const deleteAllOpen = ref(false);
const deleteTarget = ref<WatchAccount | null>(null);
const notice = ref('');
const noticeDanger = ref(false);
const pagination = ref<AdminPagination>({
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 0,
});
const queryInput = ref('');
const sourceKind = ref<SourceKind>('x');
const username = ref('');
const rssUrl = ref('');
const youtubeInput = ref('');
const youtubeResolved = ref<ResolvedYoutubeChannel | null>(null);
const redditName = ref('');
const redditSort = ref<RedditSort>('hot');
const arxivCategory = ref('cs.AI');
const hnPreset = ref<HackerNewsPreset>('frontpage');
const githubMode = ref<GithubMode>('trending');
const githubPeriod = ref<GithubPeriod>('daily');
const githubLanguage = ref('');
const githubRepo = ref('');
const githubUser = ref('');

const sourceKindOptions = computed<{ label: string; value: SourceKind }[]>(() => [
  { label: t('accounts.sourceKind.x'), value: 'x' },
  { label: t('accounts.sourceKind.rss'), value: 'rss' },
  { label: t('accounts.sourceKind.youtube'), value: 'youtube' },
  { label: t('accounts.sourceKind.reddit'), value: 'reddit' },
  { label: t('accounts.sourceKind.arxiv'), value: 'arxiv' },
  { label: t('accounts.sourceKind.hackernews'), value: 'hackernews' },
  { label: t('accounts.sourceKind.producthunt'), value: 'producthunt' },
  { label: t('accounts.sourceKind.github'), value: 'github' },
  { label: t('accounts.sourceKind.hfPapers'), value: 'hf' },
  { label: t('accounts.sourceKind.anthropic'), value: 'anthropic' },
  { label: t('accounts.sourceKind.ai2'), value: 'ai2' },
  { label: t('accounts.sourceKind.moonshot'), value: 'moonshot' },
  { label: t('accounts.sourceKind.metaAi'), value: 'meta' },
  { label: t('accounts.sourceKind.xai'), value: 'xai' },
]);
const redditSortOptions = computed<{ label: string; value: RedditSort }[]>(() => [
  { label: t('accounts.redditSort.hot'), value: 'hot' },
  { label: t('accounts.redditSort.new'), value: 'new' },
  { label: t('accounts.redditSort.top'), value: 'top' },
]);
const arxivCategoryOptions = [
  { label: 'cs.AI', value: 'cs.AI' },
  { label: 'cs.CL', value: 'cs.CL' },
  { label: 'cs.CV', value: 'cs.CV' },
  { label: 'cs.LG', value: 'cs.LG' },
  { label: 'cs.RO', value: 'cs.RO' },
  { label: 'stat.ML', value: 'stat.ML' },
];
const hnPresetOptions = computed<{ label: string; value: HackerNewsPreset }[]>(() => [
  { label: t('accounts.hnPreset.frontpage'), value: 'frontpage' },
  { label: t('accounts.hnPreset.newest'), value: 'newest' },
  { label: t('accounts.hnPreset.points100'), value: 'points100' },
  { label: t('accounts.hnPreset.points300'), value: 'points300' },
]);
const githubModeOptions = computed<{ label: string; value: GithubMode }[]>(() => [
  { label: t('accounts.githubMode.trending'), value: 'trending' },
  { label: t('accounts.githubMode.releases'), value: 'releases' },
  { label: t('accounts.githubMode.activity'), value: 'activity' },
]);
const githubPeriodOptions = computed<{ label: string; value: GithubPeriod }[]>(() => [
  { label: t('accounts.githubPeriod.daily'), value: 'daily' },
  { label: t('accounts.githubPeriod.weekly'), value: 'weekly' },
  { label: t('accounts.githubPeriod.monthly'), value: 'monthly' },
]);
const pendingFeedUrl = computed<string | null>(() => {
  switch (sourceKind.value) {
    case 'arxiv':
      return `https://export.arxiv.org/rss/${arxivCategory.value}`;
    case 'hackernews':
      return HN_PRESET_URLS[hnPreset.value];
    case 'reddit': {
      const name = redditName.value.trim().replace(/^r\//iu, '');
      if (!REDDIT_NAME_PATTERN.test(name)) {
        return null;
      }

      const sortPath = redditSort.value === 'hot' ? '' : `${redditSort.value}/`;
      return `https://www.reddit.com/r/${name}/${sortPath}.rss`;
    }
    case 'youtube': {
      const channelId = extractYoutubeChannelId(youtubeInput.value);
      return channelId === null ? null : `${YOUTUBE_FEED_PREFIX}${channelId}`;
    }
    case 'producthunt':
      return 'https://www.producthunt.com/feed';
    case 'github':
      return buildGithubSourceUrl();
    case 'hf':
      return 'https://huggingface.co/api/daily_papers?limit=50';
    case 'anthropic':
      return 'https://www.anthropic.com/news';
    case 'ai2':
      return 'https://allenai.org/blog';
    case 'moonshot':
      return 'https://platform.moonshot.cn/blog';
    case 'meta':
      return 'https://ai.meta.com/blog/';
    case 'xai':
      return 'https://x.ai/news';
    default:
      return null;
  }
});

watch([sourceKind, youtubeInput], () => {
  youtubeResolved.value = null;
});

watch([redditName, redditSort, arxivCategory, hnPreset], () => {
  youtubeResolved.value = null;
});

onMounted(() => {
  void loadAccounts(1, { silent: true });
  void loadSourcePacks();
});

async function loadAccounts(page: number, options: { silent?: boolean } = {}): Promise<void> {
  busy.value = true;

  try {
    const result = await listWatchAccounts({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      query: activeQuery.value,
    });
    accounts.value = result.watchAccounts;
    pagination.value = result.pagination;

    if (options.silent !== true) {
      setNotice(t('notice.refreshed', { time: new Date().toLocaleString() }));
    }
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    busy.value = false;
  }
}

async function applyQuery(): Promise<void> {
  activeQuery.value = normalizeQuery(queryInput.value);
  queryInput.value = activeQuery.value;
  await loadAccounts(1);
}

async function clearQuery(): Promise<void> {
  queryInput.value = '';
  activeQuery.value = '';
  await loadAccounts(1);
}

async function addAccount(): Promise<void> {
  addingAccount.value = true;
  setNotice(t('notice.accountValidating'));

  try {
    const input = await toCreateInput();
    await createWatchAccount(input);
    resetSourceForm();
    await loadAccounts(1, { silent: true });
    setNotice(t('notice.accountCreated'));
  } catch (error) {
    setNotice(
      t('notice.accountCreateFailed', {
        error: toAccountCreateErrorMessage(error),
      }),
      true,
    );
  } finally {
    addingAccount.value = false;
  }
}

async function toCreateInput(): Promise<
  | { sourceType: 'x'; xUsername: string }
  | { sourceType: 'rss'; sourceUrl: string }
  | { sourceType: 'github'; sourceUrl: string }
  | { sourceType: 'hf_papers'; sourceUrl: string }
  | { sourceType: 'anthropic_news'; sourceUrl: string }
  | { sourceType: 'ai2_blog'; sourceUrl: string }
  | { sourceType: 'moonshot_blog'; sourceUrl: string }
  | { sourceType: 'meta_ai_blog'; sourceUrl: string }
  | { sourceType: 'xai_news'; sourceUrl: string }
> {
  switch (sourceKind.value) {
    case 'x':
      return { sourceType: 'x', xUsername: username.value };
    case 'rss':
      return { sourceType: 'rss', sourceUrl: rssUrl.value };
    case 'youtube': {
      if (youtubeResolved.value !== null) {
        return { sourceType: 'rss', sourceUrl: youtubeResolved.value.feedUrl };
      }

      const channelId = extractYoutubeChannelId(youtubeInput.value);

      if (channelId !== null) {
        return { sourceType: 'rss', sourceUrl: `${YOUTUBE_FEED_PREFIX}${channelId}` };
      }

      const resolved = await resolveYoutubeChannel(youtubeInput.value);
      youtubeResolved.value = resolved;
      return { sourceType: 'rss', sourceUrl: resolved.feedUrl };
    }
    case 'reddit': {
      const name = redditName.value.trim().replace(/^r\//iu, '');

      if (!REDDIT_NAME_PATTERN.test(name)) {
        throw new Error(t('accounts.error.redditInvalid'));
      }

      const sortPath = redditSort.value === 'hot' ? '' : `${redditSort.value}/`;
      return { sourceType: 'rss', sourceUrl: `https://www.reddit.com/r/${name}/${sortPath}.rss` };
    }
    case 'arxiv':
      return { sourceType: 'rss', sourceUrl: `https://export.arxiv.org/rss/${arxivCategory.value}` };
    case 'hackernews':
      return { sourceType: 'rss', sourceUrl: HN_PRESET_URLS[hnPreset.value] };
    case 'producthunt':
      return { sourceType: 'rss', sourceUrl: 'https://www.producthunt.com/feed' };
    case 'hf':
      return {
        sourceType: 'hf_papers',
        sourceUrl: 'https://huggingface.co/api/daily_papers?limit=50',
      };
    case 'anthropic':
      return {
        sourceType: 'anthropic_news',
        sourceUrl: 'https://www.anthropic.com/news',
      };
    case 'ai2':
      return {
        sourceType: 'ai2_blog',
        sourceUrl: 'https://allenai.org/blog',
      };
    case 'moonshot':
      return {
        sourceType: 'moonshot_blog',
        sourceUrl: 'https://platform.moonshot.cn/blog',
      };
    case 'meta':
      return {
        sourceType: 'meta_ai_blog',
        sourceUrl: 'https://ai.meta.com/blog/',
      };
    case 'xai':
      return {
        sourceType: 'xai_news',
        sourceUrl: 'https://x.ai/news',
      };
    case 'github': {
      if (githubMode.value === 'trending') {
        const language = normalizeGithubLanguage(githubLanguage.value);

        if (language.length > 0 && !/^[\w .-]{1,30}$/u.test(language)) {
          throw new Error(t('accounts.error.githubLanguageInvalid'));
        }

        const base =
          language.length === 0
            ? 'https://github.com/trending'
            : `https://github.com/trending/${encodeURIComponent(language)}`;

        return { sourceType: 'github', sourceUrl: `${base}?since=${githubPeriod.value}` };
      }

      if (githubMode.value === 'releases') {
        const repo = githubRepo.value.trim();

        if (!/^[\w.-]+\/[\w.-]+$/u.test(repo)) {
          throw new Error(t('accounts.error.githubRepoInvalid'));
        }

        return { sourceType: 'rss', sourceUrl: `https://github.com/${repo}/releases.atom` };
      }

      const user = githubUser.value.trim().replace(/^@/u, '');

      if (!/^[\w-]{1,39}$/u.test(user)) {
        throw new Error(t('accounts.error.githubUserInvalid'));
      }

      return { sourceType: 'rss', sourceUrl: `https://github.com/${user}.atom` };
    }
  }
}

function normalizeGithubLanguage(value: string): string {
  return value.trim().replace(/^\/+/u, '');
}

function buildGithubSourceUrl(): string | null {
  if (githubMode.value === 'trending') {
    const language = normalizeGithubLanguage(githubLanguage.value);

    if (language.length > 0 && !/^[\w .-]{1,30}$/u.test(language)) {
      return null;
    }

    const base =
      language.length === 0
        ? 'https://github.com/trending'
        : `https://github.com/trending/${encodeURIComponent(language)}`;

    return `${base}?since=${githubPeriod.value}`;
  }

  if (githubMode.value === 'releases') {
    const repo = githubRepo.value.trim();

    return /^[\w.-]+\/[\w.-]+$/u.test(repo) ? `https://github.com/${repo}/releases.atom` : null;
  }

  const user = githubUser.value.trim().replace(/^@/u, '');

  return /^[\w-]{1,39}$/u.test(user) ? `https://github.com/${user}.atom` : null;
}

function extractYoutubeChannelId(value: string): string | null {
  const input = value.trim();

  if (YOUTUBE_CHANNEL_ID_PATTERN.test(input)) {
    return input;
  }

  const match = /(?:^|\/)channel\/(UC[A-Za-z0-9_-]{20,})(?:[/?#]|$)/u.exec(input);

  return match?.[1] ?? null;
}

function resetSourceForm(): void {
  username.value = '';
  rssUrl.value = '';
  youtubeInput.value = '';
  youtubeResolved.value = null;
  redditName.value = '';
  githubLanguage.value = '';
  githubRepo.value = '';
  githubUser.value = '';
}

async function loadSourcePacks(): Promise<void> {
  packBusy.value = true;

  try {
    sourcePacks.value = await listSourcePacks();
  } catch {
    sourcePacks.value = [];
  } finally {
    packBusy.value = false;
  }
}

const packSelectedNames = computed<string[]>(() =>
  packMemberIds.value
    .map((id) => {
      const source =
        accounts.value.find((account) => account.id === id) ??
        packMemberResults.value.find((account) => account.id === id) ??
        sourcePacks.value.flatMap((pack) => pack.sources).find((source) => source.id === id);

      if (source === undefined) {
        return id;
      }

      return sourceLabel(source);
    }),
);

const packMemberOptions = computed<WatchAccount[]>(() => {
  const merged = new Map<string, WatchAccount>();

  for (const account of packMemberResults.value) {
    merged.set(account.id, account);
  }

  for (const account of accounts.value) {
    merged.set(account.id, account);
  }

  return [...merged.values()];
});

const packMemberGroups = computed(() => {
  const groups = new Map<SourceGroupKey, WatchAccount[]>();

  for (const account of packMemberOptions.value) {
    const key = sourceGroup(account);
    const list = groups.get(key) ?? [];

    list.push(account);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .sort(
      ([left], [right]) => SOURCE_GROUP_ORDER.indexOf(left) - SOURCE_GROUP_ORDER.indexOf(right),
    )
    .map(([key, sources]) => ({
      key,
      labelKey: SOURCE_GROUP_LABEL_KEYS[key],
      sources: [...sources].sort((left, right) =>
        sourceLabel(left).localeCompare(sourceLabel(right), 'zh-Hans-CN'),
      ),
    }));
});

watch(packMemberQuery, (nextQuery) => {
  void searchPackMembers(nextQuery);
});

async function searchPackMembers(query: string): Promise<void> {
  const trimmedQuery = query.trim();

  try {
    const result = await listWatchAccounts({
      page: 1,
      pageSize: 100,
      ...(trimmedQuery.length === 0 ? {} : { query: trimmedQuery }),
    });

    packMemberResults.value = result.watchAccounts;
  } catch {
    packMemberResults.value = [];
  }
}

function togglePackMember(sourceId: string): void {
  if (packMemberIds.value.includes(sourceId)) {
    packMemberIds.value = packMemberIds.value.filter((id) => id !== sourceId);
  } else {
    packMemberIds.value = [...packMemberIds.value, sourceId];
  }
}

function openPackEditor(pack?: SourcePackView): void {
  packEditingId.value = pack?.id ?? null;
  packNameInput.value = pack?.name ?? '';
  packDescriptionInput.value = pack?.description ?? '';
  packMemberIds.value = pack?.sources.map((source) => source.id) ?? [];
  packMemberQuery.value = '';
  packMemberResults.value = [];
  packEditorOpen.value = true;

  void searchPackMembers('');
}

function closePackEditor(): void {
  packEditorOpen.value = false;
  packEditingId.value = null;
  packNameInput.value = '';
  packDescriptionInput.value = '';
  packMemberIds.value = [];
  packMemberQuery.value = '';
  packMemberResults.value = [];
}

async function savePack(): Promise<void> {
  const name = packNameInput.value.trim();

  if (name.length === 0) {
    return;
  }

  packBusy.value = true;

  try {
    const input = {
      description: packDescriptionInput.value.trim().length === 0 ? null : packDescriptionInput.value.trim(),
      name,
      sourceIds: packMemberIds.value,
    };

    if (packEditingId.value === null) {
      await createSourcePack(input);
    } else {
      await updateSourcePack(packEditingId.value, input);
    }

    setNotice(t('notice.sourcePackSaved'));
    closePackEditor();
    await loadSourcePacks();
  } catch (error) {
    setNotice(
      t('notice.sourcePackFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
      true,
    );
  } finally {
    packBusy.value = false;
  }
}

async function togglePackEnabled(pack: SourcePackView): Promise<void> {
  packBusy.value = true;

  try {
    await updateSourcePack(pack.id, { enabled: !pack.enabled });
    setNotice(t(pack.enabled ? 'notice.sourcePackDisabled' : 'notice.sourcePackEnabled'));
    await loadSourcePacks();
  } catch (error) {
    setNotice(
      t('notice.sourcePackFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
      true,
    );
  } finally {
    packBusy.value = false;
  }
}

async function movePack(pack: SourcePackView, direction: -1 | 1): Promise<void> {
  const index = sourcePacks.value.findIndex((entry) => entry.id === pack.id);
  const targetIndex = index + direction;

  if (index < 0 || targetIndex < 0 || targetIndex >= sourcePacks.value.length) {
    return;
  }

  const reordered = [...sourcePacks.value];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, moved!);

  packBusy.value = true;

  try {
    await Promise.all(
      reordered
        .map((entry, newIndex) => ({ entry, newIndex }))
        .filter(({ entry, newIndex }) => entry.sortOrder !== newIndex)
        .map(({ entry, newIndex }) => updateSourcePack(entry.id, { sortOrder: newIndex })),
    );
    await loadSourcePacks();
  } catch (error) {
    setNotice(
      t('notice.sourcePackFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
      true,
    );
  } finally {
    packBusy.value = false;
  }
}

async function confirmPackDelete(): Promise<void> {
  const pack = packDeleteTarget.value;

  packDeleteTarget.value = null;

  if (pack === null) {
    return;
  }

  packBusy.value = true;

  try {
    const result = await deleteSourcePack(pack.id);
    setNotice(t('notice.sourcePackDeleted', { count: result.affectedUsers }));
    await loadSourcePacks();
  } catch (error) {
    setNotice(
      t('notice.sourcePackFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
      true,
    );
  } finally {
    packBusy.value = false;
  }
}

function askDelete(account: WatchAccount): void {
  deleteTarget.value = account;
}

async function confirmDelete(): Promise<void> {
  if (deleteTarget.value === null) {
    return;
  }

  busy.value = true;

  try {
    const result = await deleteWatchAccount(deleteTarget.value.id);
    deleteTarget.value = null;
    await loadAccountsAfterDelete();
    setNotice(
      t('notice.accountDeleted', {
        events: result.deletedEvents,
        posts: result.deletedPosts,
      }),
    );
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    busy.value = false;
  }
}

function setNotice(message: string, danger = false): void {
  notice.value = message;
  noticeDanger.value = danger;
}

function toAccountCreateErrorMessage(error: unknown): string {
  if (error instanceof AdminApiRequestError) {
    const isGithub = sourceKind.value === 'github' && githubMode.value === 'trending';
    const isRss = sourceKind.value !== 'x' && !isGithub;

    if (error.code === 'YOUTUBE_RESOLVE_FAILED') {
      return t('accounts.error.youtubeResolveFailed');
    }

    if (error.code === 'INVALID_REQUEST' && sourceKind.value === 'youtube') {
      return t('accounts.error.youtubeInvalid');
    }

    if (error.code === 'SOURCE_REQUEST_FAILED') {
      return t(
        isGithub
          ? 'accounts.error.githubNetwork'
          : isRss
            ? 'accounts.error.rssNetwork'
            : 'accounts.error.network',
      );
    }

    if (error.code === 'SOURCE_AUTH_FAILED') {
      return t('accounts.error.loginRequired');
    }

    if (error.code === 'SOURCE_RATE_LIMITED') {
      return t('accounts.error.rateLimited');
    }

    if (error.code === 'SOURCE_RESPONSE_INVALID') {
      return t(
        isGithub
          ? 'accounts.error.githubPageUnreadable'
          : isRss
            ? 'accounts.error.rssPageUnreadable'
            : 'accounts.error.pageUnreadable',
      );
    }

    if (error.code === 'SOURCE_ACCOUNT_NOT_FOUND') {
      return t(isRss ? 'accounts.error.rssAccountNotFound' : 'accounts.error.accountNotFound');
    }

    if (error.code === 'SOURCE_INVALID_INPUT') {
      return t(isRss ? 'accounts.error.rssInvalidInput' : 'accounts.error.invalidInput');
    }

    if (error.code === 'SOURCE_VALIDATION_UNAVAILABLE') {
      return t(
        isRss
          ? 'accounts.error.rssValidationUnavailable'
          : 'accounts.error.validationUnavailable',
      );
    }
  }

  return error instanceof Error ? error.message : String(error);
}

function sourceBadge(account: WatchAccount): string {
  if (account.sourceType === 'x') {
    return 'X';
  }

  if (account.sourceType === 'github') {
    return 'GitHub';
  }

  if (account.sourceType === 'hf_papers') {
    return 'HF';
  }

  if (account.sourceType === 'anthropic_news') {
    return 'Anthropic';
  }

  if (account.sourceType === 'ai2_blog') {
    return 'AI2';
  }

  if (account.sourceType === 'moonshot_blog') {
    return 'Moonshot';
  }

  if (account.sourceType === 'meta_ai_blog') {
    return 'Meta AI';
  }

  if (account.sourceType === 'xai_news') {
    return 'xAI';
  }

  const url = account.sourceUrl ?? '';

  if (url.includes('github.com')) {
    return 'GitHub';
  }

  if (url.includes('huggingface.co')) {
    return 'HF';
  }

  if (url.includes('anthropic.com')) {
    return 'Anthropic';
  }

  if (url.includes('allenai.org')) {
    return 'AI2';
  }

  if (url.includes('moonshot.cn') || url.includes('kimi.com')) {
    return 'Moonshot';
  }

  if (url.includes('ai.meta.com')) {
    return 'Meta AI';
  }

  if (url.includes('x.ai')) {
    return 'xAI';
  }

  if (url.includes('youtube.com')) {
    return 'YouTube';
  }

  if (url.includes('reddit.com')) {
    return 'Reddit';
  }

  if (url.includes('arxiv.org')) {
    return 'arXiv';
  }

  if (url.includes('hnrss.org')) {
    return 'HN';
  }

  if (url.includes('producthunt.com')) {
    return 'PH';
  }

  return 'RSS';
}

function toAccountLabel(account: WatchAccount): string {
  if (account.sourceType === 'rss') {
    return account.sourceUrl ?? account.id;
  }

  return account.xUsername === null ? account.id : `@${account.xUsername}`;
}

async function confirmDeleteAll(): Promise<void> {
  deleteAllOpen.value = false;
  busy.value = true;

  try {
    const result = await deleteAllWatchAccounts();

    notice.value = t('accounts.deleteAllDone', {
      accounts: result.deletedAccounts,
      events: result.deletedEvents,
      posts: result.deletedPosts,
    });
    noticeDanger.value = false;
    await loadAccounts(1, { silent: true });
  } catch (error) {
    notice.value = error instanceof Error ? error.message : String(error);
    noticeDanger.value = true;
  } finally {
    busy.value = false;
  }
}

async function loadAccountsAfterDelete(): Promise<void> {
  await loadAccounts(pagination.value.page, { silent: true });

  if (accounts.value.length === 0 && pagination.value.page > 1) {
    const fallbackPage = pagination.value.totalPages > 0 ? pagination.value.totalPages : pagination.value.page - 1;
    await loadAccounts(fallbackPage, { silent: true });
  }
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/^@+/, '');
}
</script>
