import { z } from 'zod';
import { request, ensureSession } from '@/shared/client/api';
import { PlacesResultSchema, type RouteInput } from '@/shared/contracts';
import { contextSchema, regionSchema, passageSchema, publicReportSchema, mineSchema, routeSchema, searchSchema } from './models';
export const liveService = {
  initialize: ensureSession,
  region: (signal?: AbortSignal) => request('/api/region', regionSchema, {signal}),
  context: (signal?: AbortSignal) => request('/api/routing-context', contextSchema, {signal}),
  places: (bbox: number[], signal?: AbortSignal) => request(`/api/places?bbox=${bbox.join(',')}`, PlacesResultSchema, {signal}),
  passages: (signal?: AbortSignal) => request('/api/passages', z.strictObject({ configVersion:z.number(), items:z.array(passageSchema) }), {signal}),
  publicReports: (signal?: AbortSignal) => request('/api/reports?scope=public', z.strictObject({ items:z.array(publicReportSchema), truncated:z.boolean() }), {signal}),
  mine: (signal?: AbortSignal) => request('/api/reports?scope=mine', z.strictObject({ items:z.array(mineSchema), truncated:z.boolean() }), {signal}),
  search: (query:string, signal?: AbortSignal) => request(`/api/search?q=${encodeURIComponent(query)}`, searchSchema, {signal}),
  route: (input:RouteInput, signal?: AbortSignal) => request('/api/routes', routeSchema, { method:'POST', body:JSON.stringify(input), signal }),
};
export type RoutingService = typeof liveService;
