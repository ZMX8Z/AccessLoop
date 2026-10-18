import { UsageSummarySchema } from '../../shared/contracts';
import type { UsageSummaryDTO } from '../../shared/contracts';
import type {
  RoutingRepository,
  UsageEvent,
} from '../../features/routing/server/repository';

/** C can use this reducer on sanitized persisted events, or perform the same group-by in its repository. */
export function summarizeUsage(
  events: UsageEvent[],
  now = Date.now(),
): UsageSummaryDTO {
  const windowStart = new Date(now - 86400000).toISOString(),
    windowEnd = new Date(now).toISOString();
  const summary: UsageSummaryDTO = {
    windowStart,
    windowEnd,
    services: {
      ors: { calls: 0, waits: 0, errors: 0, cacheHits: 0 },
      vision: { calls: 0, waits: 0, errors: 0, cacheHits: 0 },
    },
  };
  const keys = {
    call: 'calls',
    wait: 'waits',
    error: 'errors',
    cacheHit: 'cacheHits',
  } as const;
  for (const event of events) {
    const at = Date.parse(event.at);
    if (!Number.isFinite(at)) throw new Error('Invalid usage event timestamp');
    if (
      at <= now - 86400000 ||
      at > now ||
      !['ors', 'vision'].includes(event.service)
    )
      continue;
    if (!Object.hasOwn(keys, event.event))
      throw new Error('Invalid usage event kind');
    summary.services[event.service as 'ors' | 'vision'][keys[event.event]]++;
  }
  return summary;
}
/** C mounts this behind Payload report_admin/operator authentication. Never expose it publicly. */
export async function readUsageSummary(
  repository: RoutingRepository,
  now = Date.now(),
): Promise<UsageSummaryDTO> {
  const start = new Date(now - 86400000).toISOString(),
    end = new Date(now).toISOString();
  const result = UsageSummarySchema.parse(
    await repository.getUsageSummary(start, end),
  );
  if (result.windowStart !== start || result.windowEnd !== end)
    throw new Error('Invalid usage summary window');
  return result;
}
