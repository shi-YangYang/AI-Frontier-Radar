import { SOURCE_GROUPS } from '../../config/source-groups';
import type { SourcePackRepository } from './source-pack-repository';
import type { WatchAccountRepository } from './watch-account-repository';

export interface SourcePackSeedResult {
  created: boolean;
  memberCount: number;
  packId: string | null;
  packName: string;
}

/**
 * 首启种子：确保预设监听组合的源存在，并创建首个主题包「AI 消息」挂载全部命中源。
 * 同名包已存在时跳过建包；源本身按 createIfAbsentBySource 幂等。
 */
export async function seedSourcePacks(input: {
  sourcePacks: SourcePackRepository;
  watchAccounts: WatchAccountRepository;
}): Promise<SourcePackSeedResult> {
  const group = SOURCE_GROUPS[0];

  if (group === undefined) {
    return { created: false, memberCount: 0, packId: null, packName: '' };
  }

  for (const source of group.sources) {
    await input.watchAccounts.createIfAbsentBySource(source);
  }

  const existingPack = await input.sourcePacks.findByName(group.name);

  if (existingPack !== null) {
    return {
      created: false,
      memberCount: existingPack.memberSourceIds.length,
      packId: existingPack.id,
      packName: existingPack.name,
    };
  }

  const memberSourceIds: string[] = [];

  for (const source of group.sources) {
    const watchAccount = await input.watchAccounts.findBySource(source);

    if (watchAccount !== null) {
      memberSourceIds.push(watchAccount.id);
    }
  }

  const createdPack = await input.sourcePacks.create({
    description: group.description,
    name: group.name,
    sourceIds: memberSourceIds,
  });

  return {
    created: true,
    memberCount: createdPack.memberSourceIds.length,
    packId: createdPack.id,
    packName: createdPack.name,
  };
}
