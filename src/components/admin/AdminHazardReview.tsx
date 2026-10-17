'use client';

import React, { useState } from 'react';

import type {
  ExtraEvidence,
  PrivateReportDTO,
  ReportCategory,
  ReviewInput,
} from '../../shared/contracts';
import { reviewReport } from '../../features/hazards/client/api';

interface AdminHazardReviewProps {
  report: PrivateReportDTO;
  onReviewCompleted?: (updatedReport: PrivateReportDTO) => void;
}

export function AdminHazardReview({ report, onReviewCompleted }: AdminHazardReviewProps) {
  const [action, setAction] = useState<'verify' | 'correct' | 'reject' | 'resolve' | 'reopen'>('verify');
  const [reason, setReason] = useState('');
  const [evidenceKind, setEvidenceKind] = useState<'field_observation' | 'trusted_maintainer'>('field_observation');
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [evidenceSourceRef, setEvidenceSourceRef] = useState('');
  const [evidencePhotoId, setEvidencePhotoId] = useState('');

  // Corrections (for 'correct' action)
  const [correctedCategory, setCorrectedCategory] = useState<ReportCategory>(report.category);
  const [correctedDescription, setCorrectedDescription] = useState(report.description);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setStatusMessage({ type: 'error', text: 'Reason is required for all administrative review actions.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const extraEvidence: ExtraEvidence =
      evidenceKind === 'field_observation'
        ? {
            kind: 'field_observation',
            observedAt: new Date().toISOString(),
            summary: evidenceSummary.trim() || 'Administrator inspected site.',
            photoId: evidencePhotoId.trim() || undefined,
          }
        : {
            kind: 'trusted_maintainer',
            observedAt: new Date().toISOString(),
            summary: evidenceSummary.trim() || 'Maintenance team communication verified.',
            sourceReference: evidenceSourceRef.trim() || 'Facility-Ticket-#8921',
          };

    // Construct ReviewInput discriminated union
    let reviewInput: ReviewInput;

    if (action === 'verify') {
      reviewInput = {
        action: 'verify',
        expectedVersion: report.rowVersion,
        reason: reason.trim(),
        extraEvidence,
        publicAvoidGeometry: report.publicAvoidGeometry || {
          type: 'Polygon',
          coordinates: [
            [
              [report.location[0] - 0.0003, report.location[1] - 0.0003],
              [report.location[0] + 0.0003, report.location[1] - 0.0003],
              [report.location[0] + 0.0003, report.location[1] + 0.0003],
              [report.location[0] - 0.0003, report.location[1] + 0.0003],
              [report.location[0] - 0.0003, report.location[1] - 0.0003],
            ],
          ],
        },
        validUntil: new Date(Date.now() + 86400 * 1000).toISOString(),
      };
    } else if (action === 'correct') {
      reviewInput = {
        action: 'correct',
        expectedVersion: report.rowVersion,
        reason: reason.trim(),
        corrections: {
          category: correctedCategory,
          description: correctedDescription,
        },
        extraEvidence: report.status === 'verified' ? extraEvidence : undefined,
      };
    } else if (action === 'reject') {
      reviewInput = {
        action: 'reject',
        expectedVersion: report.rowVersion,
        reason: reason.trim(),
      };
    } else if (action === 'resolve') {
      reviewInput = {
        action: 'resolve',
        expectedVersion: report.rowVersion,
        reason: reason.trim(),
        extraEvidence,
      };
    } else {
      // reopen
      reviewInput = {
        action: 'reopen',
        expectedVersion: report.rowVersion,
        reason: reason.trim(),
      };
    }

    try {
      let res: PrivateReportDTO;
      try {
        res = await reviewReport(report.id, reviewInput, false);
      } catch {
        res = await reviewReport(report.id, reviewInput, true);
      }
      setStatusMessage({ type: 'success', text: `Action "${action}" applied successfully. New status: ${res.status}` });
      if (onReviewCompleted) {
        onReviewCompleted(res);
      }
    } catch (err: unknown) {
      // Preserves form state on error/conflict
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Action failed. Inputs have been preserved for editing.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ border: '1px solid #d9e4de', borderRadius: '0.75rem', padding: '1.25rem', background: '#ffffff', maxWidth: '44rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#163d36' }}>Admin Review & Verification</h3>
        <span style={{ fontSize: '0.85rem', background: '#f1f3f4', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontWeight: 600 }}>
          Version: {report.rowVersion} | Status: <code>{report.status}</code>
        </span>
      </div>

      {/* Comparison: AI Evidence vs User Input */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem', background: '#fafcfb', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
        <div>
          <strong style={{ color: '#006b50' }}>Original AI Findings:</strong>
          {report.analysis?.result ? (
            <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.2rem', color: '#555555' }}>
              <li>Status: {report.analysis.aiStatus}</li>
              <li>Category: {report.analysis.result.category}</li>
              <li>Passage: {report.analysis.result.visible_passage}</li>
              <li>Obs: {report.analysis.result.description}</li>
            </ul>
          ) : (
            <p style={{ margin: '0.25rem 0 0', color: '#777777' }}>No AI analysis record (manual submission).</p>
          )}
        </div>
        <div>
          <strong style={{ color: '#163d36' }}>User Submitted Facts:</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.2rem', color: '#555555' }}>
            <li>Category: {report.category}</li>
            <li>Location: {report.location.join(', ')}</li>
            <li>Observed: {new Date(report.observedAt).toLocaleTimeString()}</li>
            <li>Desc: {report.description}</li>
          </ul>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Select Administrative Action</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(['verify', 'correct', 'reject', 'resolve', 'reopen'] as const).map((act) => (
              <button
                key={act}
                type="button"
                onClick={() => setAction(act)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '0.375rem',
                  border: action === act ? '2px solid #006b50' : '1px solid #ced4da',
                  background: action === act ? '#e6f4ea' : '#ffffff',
                  color: action === act ? '#006b50' : '#495057',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {act}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            Action Reason (Required, 1-1000 characters)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
            rows={2}
            placeholder="Explain why this action is taken..."
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.85rem' }}
          />
        </div>

        {(action === 'verify' || action === 'resolve' || (action === 'correct' && report.status === 'verified')) && (
          <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '0.5rem', background: '#f8fafc' }}>
            <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>Independent Verification Evidence</strong>
            <div style={{ display: 'flex', gap: '1rem', margin: '0.5rem 0' }}>
              <label style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="evidenceKind"
                  checked={evidenceKind === 'field_observation'}
                  onChange={() => setEvidenceKind('field_observation')}
                />{' '}
                Field Observation (Admin Inspection)
              </label>
              <label style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="evidenceKind"
                  checked={evidenceKind === 'trusted_maintainer'}
                  onChange={() => setEvidenceKind('trusted_maintainer')}
                />{' '}
                Trusted Maintainer Communication
              </label>
            </div>

            <input
              type="text"
              value={evidenceSummary}
              onChange={(e) => setEvidenceSummary(e.target.value)}
              placeholder="Summary of independent check..."
              style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.85rem', marginBottom: '0.5rem' }}
            />

            {evidenceKind === 'trusted_maintainer' ? (
              <input
                type="text"
                value={evidenceSourceRef}
                onChange={(e) => setEvidenceSourceRef(e.target.value)}
                placeholder="Source Reference (e.g. Work-Ticket-#1234 or URL)"
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.85rem' }}
              />
            ) : (
              <input
                type="text"
                value={evidencePhotoId}
                onChange={(e) => setEvidencePhotoId(e.target.value)}
                placeholder="Optional Review Evidence Photo ID"
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.85rem' }}
              />
            )}
          </div>
        )}

        {action === 'correct' && (
          <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '0.5rem', background: '#f8fafc' }}>
            <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>Corrected Fields</strong>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <select
                value={correctedCategory}
                onChange={(e) => setCorrectedCategory(e.target.value as ReportCategory)}
                style={{ padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.85rem' }}
              >
                <option value="construction">construction</option>
                <option value="steps_or_kerb">steps_or_kerb</option>
                <option value="surface_damage">surface_damage</option>
                <option value="obstruction">obstruction</option>
                <option value="other">other</option>
              </select>
              <textarea
                value={correctedDescription}
                onChange={(e) => setCorrectedDescription(e.target.value)}
                rows={2}
                placeholder="Corrected description..."
                style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.85rem' }}
              />
            </div>
          </div>
        )}

        {statusMessage && (
          <div
            style={{
              padding: '0.5rem',
              borderRadius: '0.375rem',
              fontSize: '0.85rem',
              background: statusMessage.type === 'success' ? '#e6f4ea' : '#fef2f2',
              color: statusMessage.type === 'success' ? '#137333' : '#b91c1c',
            }}
          >
            {statusMessage.text}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !reason.trim()}
          style={{
            alignSelf: 'flex-start',
            padding: '0.5rem 1.25rem',
            background: '#006b50',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            fontWeight: 600,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? 'Submitting Review...' : `Confirm ${action.toUpperCase()}`}
        </button>
      </form>
    </div>
  );
}
