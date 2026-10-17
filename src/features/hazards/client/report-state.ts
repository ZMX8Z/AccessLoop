import type { z } from 'zod';
import { ApiError } from '../../../shared/client/api';
import {
  ConfirmAvoidanceInputSchema, ReportCategorySchema,
  type ConfirmAvoidanceInput, type PreviewDTO, type PrivateReportDTO,
} from '../../../shared/contracts/hazards';
import type { UploadDTO } from '../../../shared/contracts/photos';
import type { AnalysisDTO } from '../../../shared/contracts/vision';

export type ReportCategory = z.infer<typeof ReportCategorySchema>;
export type DraftState = {
  photo: UploadDTO | null;
  analysis: AnalysisDTO | null;
  analysisId: string | undefined;
  category: ReportCategory;
  description: string;
  edited: boolean;
};
export const initialDraft: DraftState = {
  photo: null, analysis: null, analysisId: undefined,
  category: 'obstruction', description: '', edited: false,
};
export type DraftAction =
  | { type: 'photo'; photo: UploadDTO | null }
  | { type: 'analysis'; analysis: AnalysisDTO }
  | { type: 'facts'; category: ReportCategory; description: string }
  | { type: 'apply_analysis' }
  | { type: 'manual' };

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'photo':
      return {
        ...state, photo: action.photo, analysis: null, analysisId: undefined,
        ...(!state.edited ? { category: 'obstruction' as const, description: '' } : {}),
      };
    case 'analysis':
      if (action.analysis.photoId !== state.photo?.photoId) return state;
      return { ...state, analysis: action.analysis, analysisId: action.analysis.analysisId };
    case 'facts':
      return { ...state, category: action.category, description: action.description, edited: true };
    case 'apply_analysis': {
      const analysis = state.analysis;
      if (!analysis || analysis.aiStatus !== 'completed' || analysis.photoId !== state.photo?.photoId) return state;
      const category = ReportCategorySchema.safeParse(analysis.result.category);
      if (!category.success) return state;
      return { ...state, analysisId: analysis.analysisId, category: category.data, description: analysis.result.description };
    }
    case 'manual':
      return { ...state, analysisId: undefined };
  }
}

export function confirmationInput(preview: PreviewDTO | null, consent: boolean, now: number): ConfirmAvoidanceInput {
  if (!consent) throw new ApiError('CONFIRMATION_REQUIRED', 'Review the avoidance area and explicitly confirm it.');
  if (!preview || !Number.isFinite(now)
    || !(Date.parse(preview.expiresAt) > now) || !(Date.parse(preview.validUntil) > now)) {
    throw new ApiError('PREVIEW_STALE', 'This preview has expired. Review the updated area before confirming.');
  }
  return ConfirmAvoidanceInputSchema.parse({
    expectedVersion: preview.expectedVersion,
    observedAt: preview.observedAt,
    passage: preview.passage,
    previewDigest: preview.previewDigest,
    consent: true,
  });
}

export function isPersonalEffective(report: PrivateReportDTO, now: number): boolean {
  const avoidance = report.personalAvoidance;
  return !!avoidance && avoidance.effective && avoidance.active
    && report.status !== 'resolved' && report.status !== 'rejected'
    && avoidance.confirmationReportVersion === report.rowVersion
    && Date.parse(avoidance.validUntil) > now;
}
