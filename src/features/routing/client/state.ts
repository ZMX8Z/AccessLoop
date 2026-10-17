import type { BBox, Position } from '@/shared/contracts';
import type { Context, PublicReport, Route } from './models';
export function inside([x,y]: Position, [w,s,e,n]: BBox) { return Number.isFinite(x) && Number.isFinite(y) && x>=w && x<=e && y>=s && y<=n; }
export function contextKey(context: Pick<Context,'hazardVersion'|'personalVersion'|'configVersion'|'activeDigest'>) { return `${context.hazardVersion}/${context.personalVersion}/${context.configVersion}/${context.activeDigest}`; }
// A planning response and the poller share this publication barrier.
export function contextCanReplace(current: Context | null, next: Context) {
  if (!current) return true;
  const currentTime = Date.parse(current.evaluatedAt), nextTime = Date.parse(next.evaluatedAt);
  return next.regionId === current.regionId && nextTime >= currentTime &&
    next.hazardVersion >= current.hazardVersion && next.personalVersion >= current.personalVersion &&
    next.configVersion >= current.configVersion &&
    (nextTime !== currentTime || contextKey(next) === contextKey(current));
}
export function routeOutdated(route: Route, context: Context | null, now: number) {
  return Date.parse(route.routeRefExpiresAt)<=now || !context || contextKey(route)!==contextKey(context) || (context.nextExpiryAt !== null && Date.parse(context.nextExpiryAt)<=now) || (route.personalValidUntil !== null && Date.parse(route.personalValidUntil)<=now);
}
export function publicStatus(report: PublicReport, now: number) {
  if (report.status==='resolved') return 'Resolved · publicly confirmed';
  if (report.status==='rejected') return 'Rejected · excluded from avoidance';
  if (report.publicActivity==='expired' || Date.parse(report.publicVerification.validUntil)<=now) return 'Expired · current conditions unknown';
  if (report.publicActivity!=='active') return 'Inactive · current conditions unknown';
  return 'Verified public barrier';
}
export const accessibilityLabels = { yes:'Accessible', limited:'Limited access', no:'Not accessible', unknown:'Unknown access' };
