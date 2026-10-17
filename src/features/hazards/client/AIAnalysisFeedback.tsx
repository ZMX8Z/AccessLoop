'use client';

import React from 'react';

import type { AnalysisDTO } from '@/shared/contracts/vision';
import type { ReportCategory } from './report-state';

interface AIAnalysisFeedbackProps {
  analysis: AnalysisDTO | null;
  isLoading: boolean;
  onApplyFindings: (findings: {
    category: ReportCategory;
    description: string;
    analysisId: string;
  }) => void;
  onManualFallback: () => void;
}

export function AIAnalysisFeedback({
  analysis,
  isLoading,
  onApplyFindings,
  onManualFallback,
}: AIAnalysisFeedbackProps) {
  if (isLoading) {
    return (
      <div style={{ border: '1px solid #d9e4de', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem', background: '#fafcfb' }}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#163d36' }}>2. AI Obstruction Analysis</h3>
        <p style={{ color: '#4e6961', fontSize: '0.9rem' }}>Analyzing photo with GLM Vision model. Extracting obstacle evidence...</p>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const { aiStatus, result, unavailableReason } = analysis;

  return (
    <div style={{ border: '1px solid #d9e4de', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem', background: '#ffffff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#163d36' }}>2. AI Analysis Findings</h3>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '0.2rem 0.5rem',
            borderRadius: '1rem',
            background:
              aiStatus === 'completed'
                ? '#e6f4ea'
                : aiStatus === 'uncertain'
                ? '#fef3c7'
                : '#fee2e2',
            color:
              aiStatus === 'completed'
                ? '#137333'
                : aiStatus === 'uncertain'
                ? '#92400e'
                : '#991b1b',
          }}
        >
          {aiStatus}
        </span>
      </div>

      {aiStatus === 'completed' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
          <div>
            <strong>Identified Category:</strong>{' '}
            <span style={{ color: '#006b50', fontWeight: 600 }}>{result.category}</span> ({result.visible_passage})
          </div>
          <div>
            <strong>AI Observation:</strong> <span>{result.description}</span>
          </div>
          {result.evidence.length > 0 && (
            <div>
              <strong>Visual Evidence:</strong>
              <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.2rem', color: '#4e6961' }}>
                {result.evidence.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {result.uncertainties.length > 0 && (
            <div style={{ color: '#92400e', background: '#fffbeb', padding: '0.5rem', borderRadius: '0.375rem', fontSize: '0.85rem' }}>
              <strong>Uncertainties:</strong> {result.uncertainties.join(' ')}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
            {result.category !== 'uncertain' && (
              <button
                type="button"
                onClick={() =>
                  onApplyFindings({
                    category: result.category as ReportCategory,
                    description: result.description,
                    analysisId: analysis.analysisId,
                  })
                }
                style={{
                  padding: '0.5rem 1rem',
                  background: '#006b50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Use AI Findings
              </button>
            )}
            <button
              type="button"
              onClick={onManualFallback}
              style={{
                padding: '0.5rem 1rem',
                background: '#e9ecef',
                color: '#163d36',
                border: '1px solid #ced4da',
                borderRadius: '0.375rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Edit / Fill Manually
            </button>
          </div>
        </div>
      )}

      {aiStatus === 'uncertain' && (
        <div style={{ fontSize: '0.9rem', color: '#92400e' }}>
          <p style={{ margin: '0 0 0.5rem' }}>
            The AI could not confidently identify this obstruction. Please inspect and fill in the report details manually.
          </p>
          {result && <div>
            <p><strong>Saved AI observation (uncertain):</strong> {result.description}</p>
            {result.evidence.length > 0 && <><strong>Visible evidence:</strong><ul>{result.evidence.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
          </div>}
          {result?.uncertainties && (
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontStyle: 'italic' }}>
              Reason: {result.uncertainties.join('; ')}
            </p>
          )}
          <button
            type="button"
            onClick={onManualFallback}
            style={{
              padding: '0.5rem 1rem',
              background: '#92400e',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Continue with Manual Details
          </button>
        </div>
      )}

      {aiStatus === 'unavailable' && (
        <div style={{ fontSize: '0.9rem', color: '#991b1b' }}>
          <p style={{ margin: '0 0 0.5rem' }}>
            Vision service unavailable ({unavailableReason || 'provider timeout'}). Manual report submission is active.
          </p>
          <button
            type="button"
            onClick={onManualFallback}
            style={{
              padding: '0.5rem 1rem',
              background: '#006b50',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Fill Report Manually
          </button>
        </div>
      )}
    </div>
  );
}
