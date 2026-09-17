import type { SourceProvider, SourceProviderRegistry, SourceType } from '../types';
import { SourceProviderError } from './source-provider-error';

export function createSourceProviderRegistry(
  providers: Partial<Record<SourceType, SourceProvider>>,
): SourceProviderRegistry {
  return {
    get(sourceType: SourceType): SourceProvider {
      const provider = providers[sourceType];

      if (provider === undefined) {
        throw new SourceProviderError(
          'SOURCE_INVALID_INPUT',
          `No source provider is registered for source type "${sourceType}".`,
          {
            operation: 'fetch-timeline',
            provider: sourceType,
          },
        );
      }

      return provider;
    },
  };
}
