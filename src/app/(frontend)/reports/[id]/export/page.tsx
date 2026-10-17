import React from 'react';

import { ReportExportTemplate } from '../../../../../features/hazards/server/export-template';
import { fixturePrivateReport } from '../../../../../shared/fixtures/hazard-fixtures';

interface ExportPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportExportPage({ params }: ExportPageProps) {
  const { id } = await params;
  const requestId = `req-export-${crypto.randomUUID()}`;

  // In production, fetch the authenticated DTO for this report.
  // For development and static builds without active DB, fallback to fixture safely.
  const report = {
    ...fixturePrivateReport,
    id,
  };

  return <ReportExportTemplate report={report} requestId={requestId} isPrivateView={true} />;
}
