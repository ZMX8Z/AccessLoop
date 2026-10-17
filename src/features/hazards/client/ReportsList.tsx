'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';

import type { PrivateReportDTO, PublicReportDTO } from '../../../shared/contracts';
import { fetchReports } from './api';

export function ReportsList() {
  const [scope, setScope] = useState<'mine' | 'public'>('mine');
  const [items, setItems] = useState<(PrivateReportDTO | PublicReportDTO)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        let data;
        try {
          data = await fetchReports({ scope }, false);
        } catch {
          data = await fetchReports({ scope }, true);
        }
        if (!ignore) {
          setItems(data.items);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load reports.');
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [scope]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.8rem', color: '#163d36', margin: 0 }}>Obstacle Reports</h2>
        <Link
          href="/reports/new"
          style={{
            padding: '0.6rem 1.2rem',
            background: '#006b50',
            color: 'white',
            borderRadius: '0.5rem',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          + Report Obstacle
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #d9e4de', marginBottom: '1.25rem' }}>
        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            setScope('mine');
          }}
          style={{
            padding: '0.6rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: scope === 'mine' ? '3px solid #006b50' : '3px solid transparent',
            color: scope === 'mine' ? '#006b50' : '#4e6961',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          My Session Reports
        </button>
        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            setScope('public');
          }}
          style={{
            padding: '0.6rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: scope === 'public' ? '3px solid #006b50' : '3px solid transparent',
            color: scope === 'public' ? '#006b50' : '#4e6961',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Public Verified Reports
        </button>
      </div>

      {isLoading && <p style={{ color: '#4e6961' }}>Loading reports...</p>}
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

      {!isLoading && items.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#4e6961', background: '#fafcfb', borderRadius: '0.75rem' }}>
          No obstacle reports found in this view.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {items.map((report) => {
          const isPrivate = 'rowVersion' in report;
          const privateReport = isPrivate ? (report as PrivateReportDTO) : null;
          return (
            <div
              key={report.id}
              style={{
                border: '1px solid #d9e4de',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                background: '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#4e6961', marginRight: '0.5rem' }}>
                    {report.category}
                  </span>
                  <strong style={{ fontSize: '1.05rem', color: '#163d36' }}>{report.id}</strong>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '1rem',
                    background: report.status === 'verified' ? '#e6f4ea' : '#fef3c7',
                    color: report.status === 'verified' ? '#137333' : '#92400e',
                  }}
                >
                  {report.status}
                </span>
              </div>

              <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#333333' }}>{report.description}</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#707d77' }}>
                <span>Observed: {new Date(report.observedAt).toLocaleString()}</span>
                {privateReport?.personalAvoidance?.active && (
                  <span style={{ color: '#006b50', fontWeight: 600 }}>● Avoidance Active</span>
                )}
                <Link
                  href={`/reports/${encodeURIComponent(report.id)}/export`}
                  target="_blank"
                  style={{ color: '#006b50', fontWeight: 600, textDecoration: 'none' }}
                >
                  Export / Print ↗
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
