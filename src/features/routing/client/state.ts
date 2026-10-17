import type { BBox, Position } from '@/shared/contracts';
import type { Context, PublicReport, Route } from './models';
export function inside([x,y]: Position, [w,s,e,n]: BBox) { return Number.isFinite(x) && Number.isFinite(y) && x>=w && x<=e && y>=s && y<=n; }
export function contextKey(context: Pick<Context,'hazardVersion'|'personalVersion'|'configVersion'|'activeDigest'>) { return `${context.hazardVersion}/${context.personalVersion}/${context.configVersion}/${context.activeDigest}`; }
export function routeOutdated(route: Route, context: Context | null, now: number) {
  return !context || contextKey(route)!==contextKey(context) || (context.nextExpiryAt !== null && Date.parse(context.nextExpiryAt)<=now) || (route.personalValidUntil !== null && Date.parse(route.personalValidUntil)<=now);
}
export function publicStatus(report: PublicReport, now: number) {
  if (report.status==='resolved') return 'Resolved · publicly confirmed';
  if (report.status==='rejected') return 'Rejected · excluded from avoidance';
  if (report.publicActivity==='expired' || Date.parse(report.publicVerification.validUntil)<=now) return 'Expired · current conditions unknown';
  if (report.publicActivity!=='active') return 'Inactive · current conditions unknown';
  return 'Verified public barrier';
}
export const accessibilityLabels = { yes:'Accessible', limited:'Limited access', no:'Not accessible', unknown:'Unknown access' };
