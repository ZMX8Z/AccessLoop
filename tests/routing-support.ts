import { dRoutingFixture } from '../src/shared/fixtures/d-routing';
import type {
  RoutingRepository,
  RoutingSnapshot,
  UsageEvent,
  RouteReference,
} from '../src/features/routing/server/repository';
import type { RegionDTO } from '../src/shared/contracts';
export const instant = '2026-10-17T00:00:00.000Z';
export const region: RegionDTO = structuredClone(dRoutingFixture.region);
export const routeInput = {
  start: [151.225, -33.92] as [number, number],
  end: [151.235, -33.92] as [number, number],
  profile: 'wheelchair' as const,
  restrictions: region.routing.defaultRestrictions,
};
export const result = {
  geometry: {
    type: 'LineString' as const,
    coordinates: [routeInput.start, routeInput.end],
  },
  distanceM: 923,
  durationS: 900,
};
/** Deterministic TEST DOUBLE ONLY. Never installed by production runtime. */
export function fakeRepository() {
  const events: UsageEvent[] = [];
  const caches = new Map<string, unknown>();
  const references: RouteReference[] = [];
  let snapshot: RoutingSnapshot = {
    region: structuredClone(region),
    personalVersion: 0,
    publicAvoidances: [],
    personalAvoidances: [],
  };
  const repo: RoutingRepository = {
    resolveSession: async () => 'session-a',
    getRegion: async () => structuredClone(snapshot.region),
    getPassages: async () => [],
    getPlaces: async () => [],
    readSnapshot: async () => structuredClone(snapshot),
    getRouteReference: async (sessionKey, id) =>
      references.find((r) => r.id === id && r.sessionKey === sessionKey) ??
      null,
    publishRouteReference: async (input) => {
      const id = 'ref-' + references.length;
      references.push({ ...input, id });
      return { id, expiresAt: input.expiresAt };
    },
    getCache: async (key) => caches.get(key) ?? null,
    putCache: async (key, value) => {
      caches.set(key, structuredClone(value));
    },
    reserveBudget: async () => ({
      allowed: true,
      reservationId: 'test-reservation',
    }),
    blockBudget: async () => {},
    recordUsage: async (e) => {
      events.push(e);
    },
    getUsageSummary: async (windowStart, windowEnd) => ({
      windowStart,
      windowEnd,
      services: {
        ors: { calls: 0, waits: 0, errors: 0, cacheHits: 0 },
        vision: { calls: 0, waits: 0, errors: 0, cacheHits: 0 },
      },
    }),
  };
  return {
    repo,
    events,
    caches,
    references,
    get snapshot() {
      return snapshot;
    },
    set snapshot(value: RoutingSnapshot) {
      snapshot = value;
    },
  };
}
