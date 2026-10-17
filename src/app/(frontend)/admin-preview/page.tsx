import React from 'react';

import { AdminHazardReview, AdminRegionConfig, AdminUsageSummary } from '../../../components/admin';
import { fixturePrivateReport } from '../../../shared/fixtures/hazard-fixtures';

export default function AdminPreviewPage() {
  return (
    <main style={{ maxWidth: '52rem', margin: '2rem auto' }}>
      <div style={{ marginBottom: '1.5rem', borderBottom: '2px solid #006b50', paddingBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.8rem', color: '#163d36', margin: '0 0 0.5rem' }}>
          Admin Custom Components Preview (P1)
        </h2>
        <p style={{ color: '#4e6961', margin: 0, fontSize: '0.9rem' }}>
          This page previews the custom components delivered by Work Package B for registration in Payload Admin by backend C.
        </p>
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <AdminUsageSummary />
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', color: '#163d36', marginBottom: '0.75rem' }}>
          1. Hazard Report Administrative Review & Actions
        </h3>
        <AdminHazardReview report={fixturePrivateReport} />
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', color: '#163d36', marginBottom: '0.75rem' }}>
          2. Region & Preset Passage Operational Parameters
        </h3>
        <AdminRegionConfig />
      </section>
    </main>
  );
}
