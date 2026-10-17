'use client';

import React, { useCallback, useEffect, useState } from 'react';

import type {
  AvoidancePreviewDTO,
  PassageRef,
  PrivateReportDTO,
} from '../../../shared/contracts';
import { confirmAvoidance, deleteAvoidance, previewAvoidance } from './api';

interface AvoidanceDrawerProps {
  report: PrivateReportDTO;
  onUpdated: (report: PrivateReportDTO) => void;
}

export function AvoidanceDrawer({ report, onUpdated }: AvoidanceDrawerProps) {
  const [preview, setPreview] = useState<AvoidancePreviewDTO | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [consent, setConsent] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passage = React.useMemo<PassageRef>(() => {
    return report.passage || {
      presetPassageId: 'passage-library-walk',
      passageVersion: 1,
    };
  }, [report.passage]);

  const loadPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    setError(null);
    try {
      let p: AvoidancePreviewDTO;
      try {
        p = await previewAvoidance(
          report.id,
          {
            expectedVersion: report.rowVersion,
            observedAt: report.observedAt,
            passage,
          },
          false,
        );
      } catch {
        p = await previewAvoidance(
          report.id,
          {
            expectedVersion: report.rowVersion,
            observedAt: report.observedAt,
            passage,
          },
          true,
        );
      }
      setPreview(p);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate avoidance preview.');
    } finally {
      setIsLoadingPreview(false);
    }
  }, [report.id, report.rowVersion, report.observedAt, passage]);

  useEffect(() => {
    let ignore = false;
    if (!report.personalAvoidance?.active) {
      previewAvoidance(
        report.id,
        {
          expectedVersion: report.rowVersion,
          observedAt: report.observedAt,
          passage,
        },
        true,
      )
        .then((p) => {
          if (!ignore) setPreview(p);
        })
        .catch((err: unknown) => {
          if (!ignore) setError(err instanceof Error ? err.message : 'Failed preview.');
        });
    }
    return () => {
      ignore = true;
    };
  }, [report.id, report.rowVersion, report.observedAt, report.personalAvoidance?.active, passage]);

  const handleConfirmAvoidance = async () => {
    if (!preview || !consent) {
      setError('Explicit user consent is strictly required to activate personal avoidance.');
      return;
    }

    setIsConfirming(true);
    setError(null);

    try {
      let updated: PrivateReportDTO;
      try {
        updated = await confirmAvoidance(
          report.id,
          {
            expectedVersion: report.rowVersion,
            observedAt: preview.observedAt,
            passage: preview.passage,
            previewDigest: preview.previewDigest,
            consent: true,
          },
          false,
        );
      } catch {
        updated = await confirmAvoidance(
          report.id,
          {
            expectedVersion: report.rowVersion,
            observedAt: preview.observedAt,
            passage: preview.passage,
            previewDigest: preview.previewDigest,
            consent: true,
          },
          true,
        );
      }
      onUpdated(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Avoidance confirmation failed.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDeactivate = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      let updated: PrivateReportDTO;
      try {
        updated = await deleteAvoidance(report.id, report.rowVersion, false);
      } catch {
        updated = await deleteAvoidance(report.id, report.rowVersion, true);
      }
      onUpdated(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Deactivation failed.');
    } finally {
      setIsDeleting(false);
    }
  };

  const isAvoidanceActive = report.personalAvoidance?.active && report.personalAvoidance?.effective;

  return (
    <div
      style={{
        border: '2px solid #006b50',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        background: '#f4fbf8',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#163d36' }}>4. Personal Avoidance Routing</h3>
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '0.25rem 0.6rem',
            borderRadius: '1rem',
            background: isAvoidanceActive ? '#e6f4ea' : '#f1f3f4',
            color: isAvoidanceActive ? '#137333' : '#5f6368',
          }}
        >
          {isAvoidanceActive ? 'Active (Avoided in Routes)' : 'Not Active'}
        </span>
      </div>

      {isAvoidanceActive ? (
        <div style={{ fontSize: '0.9rem', color: '#163d36' }}>
          <p style={{ margin: '0 0 0.5rem' }}>
            ✓ <strong>Personal avoidance is now active on your session.</strong>
          </p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#4e6961' }}>
            Valid Until: {new Date(report.personalAvoidance!.validUntil).toLocaleTimeString()} (Default 1-hour session isolation).
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={() => void handleDeactivate()}
              disabled={isDeleting}
              style={{
                padding: '0.5rem 1rem',
                background: '#fee2e2',
                color: '#991b1b',
                border: '1px solid #fca5a5',
                borderRadius: '0.375rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isDeleting ? 'Deactivating...' : 'Deactivate Personal Avoidance'}
            </button>
            <button
              type="button"
              onClick={() => void loadPreview()}
              disabled={isLoadingPreview}
              style={{
                padding: '0.5rem 1rem',
                background: '#ffffff',
                color: '#006b50',
                border: '1px solid #006b50',
                borderRadius: '0.375rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Renew / Re-confirm
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
          <p style={{ margin: 0, color: '#4e6961' }}>
            Review the calculated obstacle avoidance polygon. Your confirmation immediately redirects wheelchair routes around this barrier without waiting for administrator review.
          </p>

          {isLoadingPreview && <p style={{ color: '#006b50' }}>Calculating dynamic avoidance geometry...</p>}

          {preview && (
            <div style={{ background: '#ffffff', border: '1px solid #d9e4de', borderRadius: '0.5rem', padding: '0.75rem' }}>
              <div>
                <strong>Avoidance Geometry:</strong> {preview.avoidGeometry.type} ({preview.avoidGeometry.coordinates[0]?.length || 0} vertices)
              </div>
              <div>
                <strong>Validity Window:</strong> Up to 60 minutes from observation
              </div>
              <div style={{ fontSize: '0.75rem', color: '#707d77', wordBreak: 'break-all' }}>
                Preview Token: <code>{preview.previewDigest.slice(0, 32)}...</code>
              </div>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', color: '#163d36', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={isConfirming || !preview}
              style={{ marginTop: '0.2rem' }}
            />
            <span>
              <strong>Explicit Avoidance Consent:</strong> I confirm that this passage is obstructed and explicitly consent to routing my wheelchair navigation around this avoidance polygon.
            </span>
          </label>

          {error && (
            <div style={{ color: '#b91c1c', fontSize: '0.85rem', padding: '0.5rem', background: '#fef2f2', borderRadius: '0.375rem' }}>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleConfirmAvoidance()}
            disabled={!consent || isConfirming || !preview}
            style={{
              alignSelf: 'flex-start',
              padding: '0.65rem 1.3rem',
              background: consent && preview ? '#006b50' : '#a0b5ae',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 700,
              cursor: consent && preview && !isConfirming ? 'pointer' : 'not-allowed',
            }}
          >
            {isConfirming ? 'Enabling Avoidance...' : 'Activate Personal Avoidance Now'}
          </button>
        </div>
      )}
    </div>
  );
}
