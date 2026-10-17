import React from 'react';

import { ReportWizard } from '../../../../features/hazards/client/ReportWizard';

export default function NewReportPage() {
  return (
    <main style={{ maxWidth: '48rem', margin: '2rem auto' }}>
      <ReportWizard />
    </main>
  );
}
