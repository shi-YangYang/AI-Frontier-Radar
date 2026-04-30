import { HttpRequestError } from './http-error';

export interface JsonHttpClient {
  requestJson<TResponse>(request: JsonHttpRequest): Promise<TResponse>;
}

export interface JsonHttpClientOptions {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

export interface JsonHttpRequest {
  headers?: Record<string, string>;
  jsonBody?: unknown;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ERROR_BODY_LENGTH = 1_024;

export function createJsonHttpClient(options: JsonHttpClientOptions): JsonHttpClient {
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;

  if (typeof fetchImplementation !== 'function') {
    throw new Error('A fetch implementation is required to create the JSON HTTP client.');
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const defaultHeaders = options.defaultHeaders ?? {};

  return {
    async requestJson<TResponse>(request: JsonHttpRequest): Promise<TResponse> {
      const url = buildRequestUrl(baseUrl, request.path, request.query);
      const method = request.method ?? 'GET';
      const controller = new AbortController();
      const timeoutMs = request.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers: Record<string, string> = {
          Accept: 'application/json',
          ...defaultHeaders,
          ...request.headers,
        };
        const body = request.jsonBody === undefined ? undefined : JSON.stringify(request.jsonBody);

        if (body !== undefined && headers['Content-Type'] === undefined) {
          headers['Content-Type'] = 'application/json';
        }

        const response = await fetchImplementation(url, {
          body,
          headers,
          method,
          signal: controller.signal,
        });
        const responseText = await readResponseText(response);

        if (!response.ok) {
          throw new HttpRequestError(`HTTP ${method} ${url} failed with status ${response.status}.`, {
            bodySnippet: toBodySnippet(responseText),
            method,
            statusCode: response.status,
            url,
          });
        }

        try {
          return JSON.parse(responseText) as TResponse;
        } catch (error) {
          throw new HttpRequestError(`HTTP ${method} ${url} returned invalid JSON.`, {
            bodySnippet: toBodySnippet(responseText),
            cause: error,
            method,
            statusCode: response.status,
            url,
          });
        }
      } catch (error) {
        if (error instanceof HttpRequestError) {
          throw error;
        }

        const message =
          error instanceof Error && error.name === 'AbortError'
            ? `HTTP ${method} ${url} timed out after ${timeoutMs}ms.`
            : `HTTP ${method} ${url} failed before receiving a valid response.`;

        throw new HttpRequestError(message, {
          cause: error,
          method,
          url,
        });
      } finally {
        clearTimeout(timeoutHandle);
      }
    },
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();

  if (trimmed.length === 0) {
    throw new Error('The HTTP client baseUrl must not be empty.');
  }

  return trimmed.replace(/\/+$/u, '');
}

function buildRequestUrl(
  baseUrl: string,
  path: string,
  query: JsonHttpRequest['query'],
): string {
  const normalizedPath = path.length === 0 ? '' : path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function toBodySnippet(responseText: string): string | undefined {
  if (responseText.length === 0) {
    return undefined;
  }

  return responseText.slice(0, MAX_ERROR_BODY_LENGTH);
}
