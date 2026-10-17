import { randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown): Response {
  const requestId = randomUUID();
  const safe =
    error instanceof AppError
      ? error
      : new AppError(
          500,
          'INTERNAL_ERROR',
          'The request could not be completed.',
        );
  const headers: Record<string, string> = {
    'Cache-Control': 'private, no-store',
    'X-Request-Id': requestId,
  };
  if (
    safe.code === 'RATE_LIMITED' &&
    typeof safe.details?.retryAfterSec === 'number'
  )
    headers['Retry-After'] = String(safe.details.retryAfterSec);
  return Response.json(
    {
      error: {
        code: safe.code,
        message: safe.message,
        ...(safe.details ? { details: safe.details } : {}),
      },
      requestId,
    },
    { status: safe.status, headers },
  );
}
