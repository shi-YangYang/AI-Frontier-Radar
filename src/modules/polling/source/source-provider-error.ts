import type {
  SourceProviderErrorCode,
  SourceProviderErrorDiagnostics,
} from '../types';

export class SourceProviderError extends Error {
  public readonly cause?: unknown;
  public readonly code: SourceProviderErrorCode;
  public readonly diagnostics: SourceProviderErrorDiagnostics;

  public constructor(
    code: SourceProviderErrorCode,
    message: string,
    diagnostics: SourceProviderErrorDiagnostics,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'SourceProviderError';
    this.code = code;
    this.diagnostics = diagnostics;
    this.cause = cause;
  }
}
