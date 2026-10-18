import { z } from 'zod';
import { ApiError, ensureSession, request, resetSession } from '../../../shared/client/api';
import {
  ConfirmAvoidanceInputSchema, CreateReportInputSchema, DeactivateAvoidanceInputSchema,
  PreviewDTOSchema, PreviewInputSchema, PrivateReportDTOSchema, PublicReportDTOSchema,
  UpdateReportInputSchema,
  type ConfirmAvoidanceInput, type CreateReportInput, type PreviewInput,
  type PrivateReportDTO, type PublicReportDTO, type UpdateReportInput,
} from '../../../shared/contracts/hazards';
import { UploadDTOSchema, type PhotoPurpose } from '../../../shared/contracts/photos';
import { PresetPassageSchema, RegionSchema } from '../../../shared/contracts/region';
import { VersionSchema } from '../../../shared/contracts/common';
import { AnalysisTaskSchema } from '../../../shared/contracts/vision';

export { ApiError, createIdempotencyKey, errorMessage, LatestRequest } from '../../../shared/client/api';

// Expired identities are cleared for the next user action. A write is never replayed.
async function businessRequest<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}) {
  try { return await request(path, schema, options); }
  catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') resetSession();
    throw error;
  }
}
const reportPath = (id: string) => `/api/reports/${encodeURIComponent(id)}`;
const writeOptions = (method: string, input: unknown, key: string): RequestInit => ({
  method, headers: { 'Idempotency-Key': key }, body: JSON.stringify(input),
});

export async function uploadPhoto(file: File, purpose: PhotoPurpose, key: string, signal?: AbortSignal) {
  await ensureSession();
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', purpose);
  return businessRequest('/api/uploads', UploadDTOSchema, {
    method: 'POST', headers: { 'Idempotency-Key': key }, body: form, signal,
  });
}
function waitForPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const finish = () => { signal.removeEventListener('abort', abort); resolve() }
    const timer = setTimeout(finish, milliseconds)
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
  })
}
export async function analyzePhoto(photoId: string, key: string, signal?: AbortSignal) {
  const deadline = AbortSignal.timeout(185_000)
  const polling = signal ? AbortSignal.any([signal, deadline]) : deadline
  let task = await businessRequest('/api/analyze', AnalysisTaskSchema, {
    ...writeOptions('POST', { photoId, consent: true }, key), signal: polling,
  })
  const jobId = task.jobId
  for (let count = 0; task.status === 'pending' && count < 93; count++) {
    await waitForPoll(task.pollAfterSec * 1000, polling)
    task = await businessRequest(`/api/analyze/${encodeURIComponent(jobId)}`, AnalysisTaskSchema, { signal: polling })
    if (task.jobId !== jobId) throw new ApiError('INVALID_RESPONSE', 'The service returned a different analysis task.')
  }
  if (task.status === 'failed') throw new ApiError(task.error.code, task.error.message, '', task.error.retryAfterSec ?? 0)
  if (task.status !== 'completed') throw new ApiError('PROVIDER_TIMEOUT', 'Analysis is still pending. Your photo is retained; continue manually or explicitly retry.')
  if (task.analysis.photoId !== photoId) throw new ApiError('INVALID_RESPONSE', 'The analysis does not belong to the selected photo.')
  return task.analysis
}

export function createReport(input: CreateReportInput, key: string) {
  return businessRequest('/api/reports', PrivateReportDTOSchema, writeOptions('POST', CreateReportInputSchema.parse(input), key));
}
export function patchReport(id: string, input: UpdateReportInput, key: string) {
  return businessRequest(reportPath(id), PrivateReportDTOSchema, writeOptions('PATCH', UpdateReportInputSchema.parse(input), key));
}
export function previewAvoidance(id: string, input: PreviewInput, signal?: AbortSignal) {
  return businessRequest(`${reportPath(id)}/avoidance-preview`, PreviewDTOSchema, {
    method: 'POST', body: JSON.stringify(PreviewInputSchema.parse(input)), signal,
  });
}
export function confirmAvoidance(id: string, input: ConfirmAvoidanceInput, key: string) {
  return businessRequest(`${reportPath(id)}/avoidance`, PrivateReportDTOSchema, writeOptions('POST', ConfirmAvoidanceInputSchema.parse(input), key));
}
export function deleteAvoidance(id: string, expectedVersion: number, key: string) {
  return businessRequest(`${reportPath(id)}/avoidance`, PrivateReportDTOSchema, writeOptions('DELETE', DeactivateAvoidanceInputSchema.parse({ expectedVersion }), key));
}

type ReportList<T> = { items: T[]; truncated: boolean };
const publicListSchema = z.strictObject({ items: z.array(PublicReportDTOSchema), truncated: z.boolean() });
const privateListSchema = z.strictObject({ items: z.array(PrivateReportDTOSchema), truncated: z.boolean() });
export function fetchReports(scope: 'mine', signal?: AbortSignal): Promise<ReportList<PrivateReportDTO>>;
export function fetchReports(scope: 'public', signal?: AbortSignal): Promise<ReportList<PublicReportDTO>>;
export function fetchReports(scope: 'mine' | 'public', signal?: AbortSignal): Promise<ReportList<PrivateReportDTO | PublicReportDTO>>;
export async function fetchReports(scope: 'mine' | 'public', signal?: AbortSignal): Promise<ReportList<PrivateReportDTO | PublicReportDTO>> {
  if (scope === 'mine') {
    await ensureSession();
    return businessRequest('/api/reports?scope=mine', privateListSchema, { signal });
  }
  return businessRequest('/api/reports?scope=public', publicListSchema, { signal });
}
export function fetchReport(id: string, signal?: AbortSignal) {
  return businessRequest(reportPath(id), z.union([PrivateReportDTOSchema, PublicReportDTOSchema]), { signal });
}
export async function loadReportConfig(signal?: AbortSignal) {
  await ensureSession();
  const [region, passages] = await Promise.all([
    businessRequest('/api/region', RegionSchema, { signal }),
    businessRequest('/api/passages', z.strictObject({ configVersion: VersionSchema, items: z.array(PresetPassageSchema) }), { signal }),
  ]);
  if (region.configVersion !== passages.configVersion) {
    throw new ApiError('CONFIG_CONFLICT', 'The region changed while loading. Reload the available passages.');
  }
  return { region, passages: passages.items };
}
