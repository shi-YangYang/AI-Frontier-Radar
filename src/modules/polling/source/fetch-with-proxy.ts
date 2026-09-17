import { ProxyAgent, fetch as undiciFetch } from 'undici';

export type FetchImplementation = typeof fetch;

export function createFetchWithProxy(proxyUrl: string | undefined): FetchImplementation {
  if (proxyUrl === undefined || proxyUrl.trim().length === 0) {
    return globalThis.fetch;
  }

  const dispatcher = new ProxyAgent(proxyUrl);

  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init ?? {}),
      dispatcher,
    } as Parameters<typeof undiciFetch>[1])) as unknown as FetchImplementation;
}
