import React from 'react';

import { ReportsList } from '../../../features/hazards/client/ReportsList';

export default function ReportsPage() {
  return (
    <main style={{ maxWidth: '48rem', margin: '2rem auto' }}>
      <ReportsList />
    </main>
  );
}
