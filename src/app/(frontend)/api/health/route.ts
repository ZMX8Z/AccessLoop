import { successResponse } from '../../../../server/http/responses';
import type { HealthData } from '../../../../shared/contracts';

export function GET(): Response {
  return successResponse<HealthData>({ status: 'ok' });
}
