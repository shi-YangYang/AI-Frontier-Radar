export interface HttpRequestErrorContext {
  bodySnippet?: string;
  cause?: unknown;
  method: string;
  statusCode?: number;
  url: string;
}

export class HttpRequestError extends Error {
  public readonly bodySnippet?: string;
  public readonly cause?: unknown;
  public readonly method: string;
  public readonly statusCode?: number;
  public readonly url: string;

  public constructor(message: string, context: HttpRequestErrorContext) {
    super(message);
    this.name = 'HttpRequestError';
    this.bodySnippet = context.bodySnippet;
    this.cause = context.cause;
    this.method = context.method;
    this.statusCode = context.statusCode;
    this.url = context.url;
  }
}
