import type { SourceGroupDefinition } from '../../config/source-groups';
import type { WatchAccountRepository } from './watch-account-repository';

export interface SourceGroupStatus {
  description: string;
  details?: string;
  id: string;
  installedCount: number;
  name: string;
  sourceCount: number;
}

export interface SourceGroupApplyResult {
  created: number;
  existing: number;
}

export async function getSourceGroupStatuses(
  watchAccounts: Pick<WatchAccountRepository, 'findBySource'>,
  groups: readonly SourceGroupDefinition[],
): Promise<SourceGroupStatus[]> {
  const statuses: SourceGroupStatus[] = [];

  for (const group of groups) {
    let installedCount = 0;

    for (const source of group.sources) {
      const existing = await watchAccounts.findBySource(source);

      if (existing !== null) {
        installedCount += 1;
      }
    }

    statuses.push({
      description: group.description,
      ...(group.details === undefined ? {} : { details: group.details }),
      id: group.id,
      installedCount,
      name: group.name,
      sourceCount: group.sources.length,
    });
  }

  return statuses;
}

export async function applySourceGroup(
  watchAccounts: Pick<WatchAccountRepository, 'createIfAbsentBySource'>,
  group: SourceGroupDefinition,
): Promise<SourceGroupApplyResult> {
  let created = 0;
  let existing = 0;

  for (const source of group.sources) {
    const result = await watchAccounts.createIfAbsentBySource(source);

    if (result.created) {
      created += 1;
    } else {
      existing += 1;
    }
  }

  return {
    created,
    existing,
  };
}
