import { randomUUID } from 'node:crypto';

import type { SuccessEnvelope } from '../../shared/contracts';

export function successResponse<T>(data: T): Response {
  const requestId = randomUUID();
  const body: SuccessEnvelope<T> = { data, requestId };

  return Response.json(body, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Request-Id': requestId,
    },
  });
}
