import { z } from 'zod';
export class ApiError extends Error {
  constructor(public code: string, message: string, public requestId = '', public retryAfterSec = 0) { super(message); }
}
export async function request<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/api/') || path.includes('://')) throw new Error('Business API paths only.');
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  const timeout = AbortSignal.timeout(15000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try { response = await fetch(path, { ...options, signal, headers, credentials: 'same-origin', cache: 'no-store' }); }
  catch (error) { if (options.signal?.aborted) throw error; if (timeout.aborted) throw new ApiError('PROVIDER_TIMEOUT', 'The request timed out. Your inputs are unchanged.'); throw new ApiError('NETWORK_ERROR', 'Unable to connect. Your inputs are unchanged.'); }
  const body = await response.json().catch(() => null);
  const requestId = response.headers.get('X-Request-Id') ?? body?.requestId ?? '';
  if (!response.ok) {
    const raw = body?.error;
    const retry = Number(raw?.details?.retryAfterSec ?? response.headers.get('Retry-After') ?? 0);
    throw new ApiError(raw?.code ?? 'SERVICE_UNAVAILABLE', raw?.message ?? 'This service is not available yet. Your inputs are unchanged.', requestId, Number.isFinite(retry) ? Math.max(0,retry) : 0);
  }
  const parsed = schema.safeParse(body?.data);
  if (!parsed.success || typeof body?.requestId !== 'string') throw new ApiError('INVALID_RESPONSE', 'The service returned an invalid response. Please try again.', requestId);
  return parsed.data;
}
let session: Promise<unknown> | undefined;
export function ensureSession() {
  return session ??= request('/api/session', z.strictObject({ ready: z.literal(true), regionId: z.string(), isDemo: z.boolean() }), { method:'POST', body:'{}' }).catch(error => { session = undefined; throw error; });
}
export function resetSession() { session = undefined; }
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Your inputs are unchanged.';
}
// Use one key for retries of the same write; generate a new key for a new action.
export function createIdempotencyKey() { return crypto.randomUUID(); }
export class LatestRequest {
  private generation = 0;
  private controller?: AbortController;
  cancel() { this.generation++; this.controller?.abort(); }
  begin() {
    this.cancel();
    const generation = this.generation;
    const controller = this.controller = new AbortController();
    return { signal: controller.signal, current: () => generation === this.generation && !controller.signal.aborted };
  }
}
