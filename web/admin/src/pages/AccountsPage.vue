<template>
  <section>
    <PageHeader :title="t('accounts.title')" :subtitle="t('accounts.subtitle')">
      <form class="source-add-form" @submit.prevent="addAccount">
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
          />
          <input
            v-else-if="sourceKind === 'rss'"
            v-model="rssUrl"
            autocomplete="off"
            :disabled="addingAccount"
            :placeholder="t('accounts.rssPlaceholder')"
          />
          <input
            v-else-if="sourceKind === 'youtube'"
            v-model="youtubeInput"
            autocomplete="off"
            :disabled="addingAccount"
            :placeholder="t('accounts.youtubePlaceholder')"
          />
          <template v-else-if="sourceKind === 'reddit'">
            <input
              v-model="redditName"
              autocomplete="off"
              :disabled="addingAccount"
              :placeholder="t('accounts.redditPlaceholder')"
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
              />
            </template>
            <input
              v-else-if="githubMode === 'releases'"
              v-model="githubRepo"
              autocomplete="off"
              :disabled="addingAccount"
              :placeholder="t('accounts.githubRepoPlaceholder')"
            />
            <input
              v-else
              v-model="githubUser"
              autocomplete="off"
              :disabled="addingAccount"
              :placeholder="t('accounts.githubUserPlaceholder')"
            />
          </template>
          <template v-else-if="sourceKind === 'hf'">
            <span class="muted source-add-inline-hint">{{ t('accounts.hfPapersHint') }}</span>
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
    </PageHeader>

    <ToastNotice :message="notice" :danger="noticeDanger" />

    <div class="panel">
      <form class="query-form" @submit.prevent="applyQuery">
        <label>
          <span>{{ t('accounts.queryLabel') }}</span>
          <input
            v-model="queryInput"
            autocomplete="off"
            :disabled="busy"
            :placeholder="t('accounts.queryPlaceholder')"
          />
        </label>
        <button class="primary" type="submit" :disabled="busy">{{ t('actions.query') }}</button>
        <button type="button" :disabled="busy" @click="clearQuery">{{ t('accounts.clearQuery') }}</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('table.source') }}</th>
              <th>{{ t('table.lastPolledAt') }}</th>
              <th>{{ t('table.lastPollStatus') }}</th>
              <th>{{ t('table.baselinePost') }}</th>
              <th>{{ t('table.latestPost') }}</th>
              <th>{{ t('table.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="accounts.length === 0">
              <td colspan="6" class="empty-cell">{{ t('accounts.empty') }}</td>
            </tr>
            <tr v-for="account in accounts" :key="account.id">
              <td>
                <strong>
                  <span class="status-badge neutral source-type-badge">
                    {{ sourceBadge(account) }}
                  </span>
                  {{ toAccountLabel(account) }}
                </strong>
                <div class="muted">{{ account.displayName ?? '-' }}</div>
              </td>
              <td>{{ formatDateTime(account.lastPolledAt) }}</td>
              <td><StatusBadge :status="account.lastPollStatus" /></td>
              <td><code>{{ dash(account.baselinePostId) }}</code></td>
              <td><code>{{ dash(account.lastSeenPostId) }}</code></td>
              <td>
                <button class="danger" type="button" :disabled="busy" @click="askDelete(account)">
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

    <ConfirmModal
      :open="deleteTarget !== null"
      :title="t('accounts.deleteTitle')"
      :body="deleteTarget === null ? '' : toAccountLabel(deleteTarget)"
      :detail="t('accounts.deleteBody')"
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import {
  AdminApiRequestError,
  createWatchAccount,
  deleteWatchAccount,
  listWatchAccounts,
  resolveYoutubeChannel,
  type AdminPagination,
  type ResolvedYoutubeChannel,
  type WatchAccount,
} from '../api/admin-api';
import ConfirmModal from '../components/ConfirmModal.vue';
import PageHeader from '../components/PageHeader.vue';
import PaginationBar from '../components/PaginationBar.vue';
import SelectControl from '../components/SelectControl.vue';
import StatusBadge from '../components/StatusBadge.vue';
import ToastNotice from '../components/ToastNotice.vue';
import { t } from '../i18n';
import { DEFAULT_PAGE_SIZE, dash, formatDateTime } from '../utils';

type SourceKind =
  | 'x'
  | 'rss'
  | 'youtube'
  | 'reddit'
  | 'arxiv'
  | 'hackernews'
  | 'producthunt'
  | 'github'
  | 'hf';
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

const accounts = ref<WatchAccount[]>([]);
const activeQuery = ref('');
const addingAccount = ref(false);
const busy = ref(false);
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

function askDelete(account: WatchAccount): void {
  deleteTarget.value = account;
}

async function confirmDelete(): Promise<void> {
  if (deleteTarget.value === null) {
    return;
  }

  busy.value = true;

  try {
    await deleteWatchAccount(deleteTarget.value.id);
    deleteTarget.value = null;
    await loadAccountsAfterDelete();
    setNotice(t('notice.accountDeleted'));
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

  const url = account.sourceUrl ?? '';

  if (url.includes('github.com')) {
    return 'GitHub';
  }

  if (url.includes('huggingface.co')) {
    return 'HF';
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
