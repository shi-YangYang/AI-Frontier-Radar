import { t } from './i18n';
import type { PollRun } from './api/admin-api';

export const DEFAULT_PAGE_SIZE = 10;

export function formatDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim().length === 0) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return [
    date.getFullYear(),
    '/',
    date.getMonth() + 1,
    '/',
    date.getDate(),
    ' ',
    padTwoDigits(date.getHours()),
    ':',
    padTwoDigits(date.getMinutes()),
    ':',
    padTwoDigits(date.getSeconds()),
  ].join('');
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function dash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return String(value);
}

export function validateTimeRange(from: string, to: string): string | null {
  if (from.length === 0 || to.length === 0) {
    return null;
  }

  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();

  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
    return 'notice.invalidTimeRange';
  }

  if (fromTime > toTime) {
    return 'notice.invalidTimeRange';
  }

  return null;
}

export function pollProgress(run: PollRun): string {
  return t('poll.progress', {
    failed: run.accountsFailed,
    succeeded: run.accountsSucceeded,
    total: run.accountsTotal,
  });
}

export function translateStatus(status: string | null | undefined): string {
  if (status === null || status === undefined || status === '') {
    return '-';
  }

  const key = ('status.' + status) as Parameters<typeof t>[0];
  const translated = t(key);
  return translated === key ? status : translated;
}

export function translateJob(job: string): string {
  const key = ('jobs.' + job) as Parameters<typeof t>[0];
  const translated = t(key);
  return translated === key ? t('jobs.background') : translated;
}
