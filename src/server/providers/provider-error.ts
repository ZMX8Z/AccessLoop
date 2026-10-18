import { createHash } from 'node:crypto';

import { AppError } from '../http/errors';

export class ProviderError extends AppError {
  public readonly retryable: boolean;
  public readonly retryAfterSec?: number;
  public readonly quotaResetAt?: string;

  constructor(status: number, code: string, message: string, options: {
    retryable: boolean; retryAfterSec?: number; quotaResetAt?: string;
  }) {
    const details = {
      ...(options.retryAfterSec !== undefined ? { retryAfterSec: options.retryAfterSec } : {}),
      ...(options.quotaResetAt !== undefined ? { resetAt: options.quotaResetAt } : {}),
    };
    super(status, code, message, Object.keys(details).length ? details : undefined);
    this.name = 'ProviderError';
    this.retryable = options.retryable;
    this.retryAfterSec = options.retryAfterSec;
    this.quotaResetAt = options.quotaResetAt;
  }
}

export type ProviderOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
};

function unavailable(retryable: boolean): ProviderError {
  return new ProviderError(503, 'PROVIDER_UNAVAILABLE', 'The external service is unavailable. Please try again later.', { retryable });
}

export function invalidProviderResult(): ProviderError {
  return new ProviderError(502, 'INVALID_PROVIDER_RESULT', 'The external service returned an invalid result.', { retryable: false });
}

function timeoutError(): ProviderError {
  return new ProviderError(504, 'PROVIDER_TIMEOUT', 'The external service took too long to respond.', { retryable: true });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function resetAt(headers: Headers): string | undefined {
  const header = headers.get('x-ratelimit-reset');
  if (!header || !/^\d+(?:\.\d+)?$/.test(header)) return undefined;
  const timestamp = Number(header) * 1000;
  if (!Number.isFinite(timestamp) || timestamp > 8.64e15) return undefined;
  return new Date(timestamp).toISOString();
}

function retryAfter(headers: Headers): number {
  const value = headers.get('retry-after');
  if (!value) return 60;
  const seconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= Number.MAX_SAFE_INTEGER ? Math.ceil(seconds) : 60;
}

function responseError(response: Response, body: unknown, kind: 'ors' | 'geocoding'): ProviderError {
  const payload = record(body);
  const error = payload?.error;
  const errorObject = record(error);
  // Match only the known quota signal, rather than treating every 403 as quota.
  const quotaMessage = typeof error === 'string' ? error : errorObject?.message;
  if (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' ||
    (typeof quotaMessage === 'string' && /^(?:daily\s+)?quota\s+exceeded\.?$/i.test(quotaMessage.trim())))) {
    return new ProviderError(503, 'QUOTA_EXHAUSTED', 'The external service quota is exhausted. Please try again later.', {
      retryable: false, quotaResetAt: resetAt(response.headers),
    });
  }
  if (response.status === 429) {
    return new ProviderError(429, 'RATE_LIMITED', 'Please wait before trying again.', { retryable: true, retryAfterSec: retryAfter(response.headers) });
  }
  if (response.status === 401 || response.status === 403) return unavailable(false);
  if (kind === 'ors' && [400, 404, 422].includes(response.status) && [2009, 2010].includes(Number(errorObject?.code))) {
    return new ProviderError(422, 'NO_ROUTE', 'No route was found with the selected endpoints and restrictions.', { retryable: false });
  }
  if (response.status === 400) {
    return new ProviderError(400, 'INVALID_INPUT', 'The external service could not process the selected parameters.', { retryable: false });
  }
  if (response.status === 408 || response.status === 504) return timeoutError();
  return unavailable(response.status >= 500);
}

// Deliberately single-attempt: the caller owns persistent budget reservations and bounded retries.
export function createProviderTransport(options: ProviderOptions, allowedBase: string, kind: 'ors' | 'geocoding') {
  let baseUrl: string;
  try {
    const url = new URL(options.baseUrl ?? allowedBase);
    baseUrl = url.href.replace(/\/+$/, '');
    if (url.username || url.password || url.search || url.hash || baseUrl !== allowedBase) throw unavailable(false);
  } catch {
    throw unavailable(false);
  }
  const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const timeoutMs = options.timeoutMs ?? 6000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw unavailable(false);
  const fetcher = options.fetch ?? fetch;

  return {
    baseUrl,
    keyFingerprint: `sha256:${createHash('sha256').update(apiKey).digest('hex')}`,
    async request(path: string, init: RequestInit): Promise<unknown> {
      if (!apiKey) throw unavailable(false);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(timeoutError()); }, timeoutMs);
      });
      const perform = async () => {
        let response: Response;
        try {
          response = await fetcher(`${baseUrl}${path}`, {
            ...init,
            headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: apiKey },
            signal: controller.signal, redirect: 'error', cache: 'no-store',
          });
        } catch {
          throw controller.signal.aborted ? timeoutError() : unavailable(true);
        }
        if (response.redirected || (response.status >= 300 && response.status < 400)) throw unavailable(false);
        let body: unknown;
        try { body = await response.json(); }
        catch (error) {
          if (controller.signal.aborted) throw timeoutError();
          if (response.ok) throw error instanceof SyntaxError ? invalidProviderResult() : unavailable(true);
        }
        if (!response.ok) throw responseError(response, body, kind);
        return body;
      };
      try { return await Promise.race([perform(), deadline]); }
      finally { clearTimeout(timer); }
    },
  };
}
