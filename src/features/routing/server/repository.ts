import type {
  AvoidGeometry,
  BBox,
  LineString,
  PlaceDTO,
  PresetPassageDTO,
  RegionDTO,
  RoutingContextDTO,
  UsageSummaryDTO,
} from '../../../shared/contracts';

export type ServiceName = 'ors' | 'vision' | 'geocoding' | 'poi';
export type UsageEvent = {
  service: ServiceName;
  event: 'call' | 'wait' | 'error' | 'cacheHit';
  at: string;
  category?: string;
};
export type PublicAvoidance = {
  id: string;
  publicRevision: number;
  publicAvoidGeometry: AvoidGeometry;
  validUntil: string;
  status: 'verified' | 'pending' | 'resolved' | 'rejected';
};
export type PersonalAvoidance = {
  id: string;
  rowVersion: number;
  confirmationReportVersion: number;
  avoidGeometry: AvoidGeometry;
  validUntil: string;
  active: boolean;
  reportStatus:
    'pending' | 'ai_assessed' | 'verified' | 'resolved' | 'rejected';
};
export type RoutingSnapshot = {
  region: RegionDTO;
  personalVersion: number;
  publicAvoidances: PublicAvoidance[];
  personalAvoidances: PersonalAvoidance[];
};
export type RouteReference = {
  id: string;
  sessionKey: string;
  regionId: string;
  geometry: LineString;
  expiresAt: string;
  context: Pick<
    RoutingContextDTO,
    'hazardVersion' | 'personalVersion' | 'configVersion' | 'activeDigest'
  >;
};
export type BudgetRequest = {
  service: ServiceName;
  keyFingerprint: string;
  now: string;
  minuteLimit: number;
  dayLimit: number;
};
export type BudgetReservation =
  | { allowed: true; reservationId: string }
  | {
      allowed: false;
      reason: 'rate' | 'quota';
      retryAfterSec: number;
      resetAt?: string;
    };

/** Implemented and installed by C, using the ONLY Payload connection and transactions.
 * No method may replace failed reads with empty datasets. No production memory fallback.
 * readSnapshot must be one consistent snapshot, scoped using the server-resolved session.
 */
export interface RoutingRepository {
  resolveSession(request: Request): Promise<string | null>;
  getRegion(): Promise<RegionDTO>;
  getPassages(): Promise<PresetPassageDTO[]>;
  getPlaces(bbox: BBox): Promise<PlaceDTO[]>;
  readSnapshot(sessionKey: string): Promise<RoutingSnapshot>;
  getRouteReference(
    sessionKey: string,
    routeRef: string,
  ): Promise<RouteReference | null>;
  /** Atomically compare current versions AND freshly evaluated activeDigest at commit time.
   * Return null if stale; create an unguessable reference only for this session, max 900s.
   */
  publishRouteReference(
    input: Omit<RouteReference, 'id'>,
  ): Promise<{ id: string; expiresAt: string } | null>;
  getCache(key: string): Promise<unknown | null>;
  putCache(key: string, value: unknown, expiresAt: string): Promise<void>;
  /** Serialize by service+keyFingerprint, rolling 60s and 24h; reserve before releasing txn.
   * Persist reservations across restarts, count uncertain/timeouts conservatively.
   */
  reserveBudget(input: BudgetRequest): Promise<BudgetReservation>;
  blockBudget(input: {
    service: ServiceName;
    keyFingerprint: string;
    until: string;
    reason: 'rate' | 'quota';
  }): Promise<void>;
  /** No coordinates/session IDs/query/photos/key fingerprints in these event records. */
  recordUsage(event: UsageEvent): Promise<void>;
  getUsageSummary(
    windowStart: string,
    windowEnd: string,
  ): Promise<UsageSummaryDTO>;
}
