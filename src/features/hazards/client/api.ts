import type {
  AnalysisDTO,
  AvoidanceConfirmInput,
  AvoidancePreviewDTO,
  AvoidancePreviewInput,
  CreateReportInput,
  PatchReportInput,
  PrivateReportDTO,
  PublicReportDTO,
  ReportsQuery,
  ReviewInput,
  UploadPurpose,
  UploadResponseData,
  UsageSummaryData,
} from '../../../shared/contracts';
import {
  fixtureAvoidancePreview,
  fixtureCompletedAnalysis,
  fixturePrivateReport,
  fixturePublicReport,
  fixtureUploadResponse,
  fixtureUsageSummary,
} from '../../../shared/fixtures/hazard-fixtures';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getBaseHeaders(idempotent = false): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (idempotent) {
    headers['Idempotency-Key'] = `idem-${crypto.randomUUID()}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const isJson = res.headers.get('content-type')?.includes('application/json');
  if (!res.ok) {
    if (isJson) {
      const errorBody = await res.json();
      throw new ApiError(
        res.status,
        errorBody.error?.code || 'UNKNOWN_ERROR',
        errorBody.error?.message || res.statusText,
        errorBody.requestId,
        errorBody.error?.details,
      );
    }
    throw new ApiError(res.status, 'HTTP_ERROR', res.statusText);
  }
  const body = await res.json();
  return (body.data !== undefined ? body.data : body) as T;
}

export async function uploadPhoto(
  file: File,
  purpose: UploadPurpose = 'report',
  useMock = false,
): Promise<UploadResponseData> {
  if (useMock) {
    return fixtureUploadResponse;
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', purpose);

  const res = await fetch('/api/uploads', {
    method: 'POST',
    headers: {
      'Idempotency-Key': `idem-${crypto.randomUUID()}`,
    },
    body: formData,
  });
  return handleResponse<UploadResponseData>(res);
}

export async function analyzePhoto(
  photoId: string,
  consent = true,
  useMock = false,
): Promise<AnalysisDTO> {
  if (useMock) {
    return fixtureCompletedAnalysis;
  }
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      ...getBaseHeaders(true),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ photoId, consent }),
  });
  return handleResponse<AnalysisDTO>(res);
}

export async function createReport(
  input: CreateReportInput,
  useMock = false,
): Promise<PrivateReportDTO> {
  if (useMock) {
    return {
      ...fixturePrivateReport,
      description: input.description,
      category: input.category,
      location: input.location,
      observedAt: input.observedAt,
    };
  }
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: {
      ...getBaseHeaders(true),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return handleResponse<PrivateReportDTO>(res);
}

export async function patchReport(
  reportId: string,
  input: PatchReportInput,
  useMock = false,
): Promise<PrivateReportDTO> {
  if (useMock) {
    return {
      ...fixturePrivateReport,
      id: reportId,
      rowVersion: input.expectedVersion + 1,
      description: input.description ?? fixturePrivateReport.description,
    };
  }
  const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    headers: {
      ...getBaseHeaders(true),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return handleResponse<PrivateReportDTO>(res);
}

export async function previewAvoidance(
  reportId: string,
  input: AvoidancePreviewInput,
  useMock = false,
): Promise<AvoidancePreviewDTO> {
  if (useMock) {
    return {
      ...fixtureAvoidancePreview,
      expectedVersion: input.expectedVersion,
      observedAt: input.observedAt,
      passage: input.passage,
    };
  }
  const res = await fetch(
    `/api/reports/${encodeURIComponent(reportId)}/avoidance-preview`,
    {
      method: 'POST',
      headers: {
        ...getBaseHeaders(false),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );
  return handleResponse<AvoidancePreviewDTO>(res);
}

export async function confirmAvoidance(
  reportId: string,
  input: AvoidanceConfirmInput,
  useMock = false,
): Promise<PrivateReportDTO> {
  if (useMock) {
    return {
      ...fixturePrivateReport,
      id: reportId,
      rowVersion: input.expectedVersion + 1,
      personalAvoidance: {
        active: true,
        effective: true,
        passage: input.passage,
        avoidGeometry: fixtureAvoidancePreview.avoidGeometry,
        decisionSource: 'ai_user_confirmed',
        observedAt: input.observedAt,
        confirmedAt: new Date().toISOString(),
        validUntil: new Date(Date.now() + 3600 * 1000).toISOString(),
        confirmationReportVersion: input.expectedVersion + 1,
      },
    };
  }
  const res = await fetch(
    `/api/reports/${encodeURIComponent(reportId)}/avoidance`,
    {
      method: 'POST',
      headers: {
        ...getBaseHeaders(true),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );
  return handleResponse<PrivateReportDTO>(res);
}

export async function deleteAvoidance(
  reportId: string,
  expectedVersion: number,
  useMock = false,
): Promise<PrivateReportDTO> {
  if (useMock) {
    return {
      ...fixturePrivateReport,
      id: reportId,
      rowVersion: expectedVersion + 1,
      personalAvoidance: null,
    };
  }
  const res = await fetch(
    `/api/reports/${encodeURIComponent(reportId)}/avoidance`,
    {
      method: 'DELETE',
      headers: {
        ...getBaseHeaders(true),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expectedVersion }),
    },
  );
  return handleResponse<PrivateReportDTO>(res);
}

export async function fetchReports(
  query: ReportsQuery = { scope: 'public' },
  useMock = false,
): Promise<{ items: (PublicReportDTO | PrivateReportDTO)[]; truncated: boolean }> {
  if (useMock) {
    return {
      items: query.scope === 'mine' ? [fixturePrivateReport] : [fixturePublicReport],
      truncated: false,
    };
  }
  const params = new URLSearchParams();
  if (query.scope) params.set('scope', query.scope);
  if (query.bbox) params.set('bbox', query.bbox.join(','));

  const res = await fetch(`/api/reports?${params.toString()}`, {
    headers: getBaseHeaders(false),
  });
  return handleResponse<{ items: (PublicReportDTO | PrivateReportDTO)[]; truncated: boolean }>(res);
}

export async function fetchReport(
  id: string,
  useMock = false,
): Promise<PrivateReportDTO | PublicReportDTO> {
  if (useMock) {
    return fixturePrivateReport;
  }
  const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
    headers: getBaseHeaders(false),
  });
  return handleResponse<PrivateReportDTO | PublicReportDTO>(res);
}

export async function reviewReport(
  reportId: string,
  input: ReviewInput,
  useMock = false,
): Promise<PrivateReportDTO> {
  if (useMock) {
    return {
      ...fixturePrivateReport,
      id: reportId,
      rowVersion: input.expectedVersion + 1,
      status: input.action === 'reject' ? 'rejected' : input.action === 'resolve' ? 'resolved' : 'verified',
    };
  }
  const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/review`, {
    method: 'PATCH',
    headers: {
      ...getBaseHeaders(true),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return handleResponse<PrivateReportDTO>(res);
}

export async function fetchUsageSummary(useMock = false): Promise<UsageSummaryData> {
  if (useMock) {
    return fixtureUsageSummary;
  }
  const res = await fetch('/api/admin/usage', {
    headers: getBaseHeaders(false),
  });
  return handleResponse<UsageSummaryData>(res);
}
