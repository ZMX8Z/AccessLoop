'use client';

import React, { useState } from 'react';

import type {
  CreateReportInput,
  PassageRef,
  Position,
  PrivateReportDTO,
  ReportCategory,
} from '../../../shared/contracts';
import { createReport } from './api';

interface ReportFormProps {
  photoId: string;
  analysisId?: string;
  initialCategory?: ReportCategory;
  initialDescription?: string;
  onReportCreated: (report: PrivateReportDTO) => void;
  disabled?: boolean;
}

const CATEGORY_OPTIONS: { value: ReportCategory; label: string }[] = [
  { value: 'construction', label: 'Construction / Work Zone' },
  { value: 'steps_or_kerb', label: 'Steps or Unramped Kerb' },
  { value: 'surface_damage', label: 'Severe Surface Damage / Pothole' },
  { value: 'obstruction', label: 'Physical Obstruction (Bicycle/Rubbish/Fence)' },
  { value: 'other', label: 'Other Accessibility Hazard' },
];

export function ReportForm({
  photoId,
  analysisId,
  initialCategory = 'construction',
  initialDescription = '',
  onReportCreated,
  disabled = false,
}: ReportFormProps) {
  const [category, setCategory] = useState<ReportCategory>(initialCategory);
  const [description, setDescription] = useState(initialDescription);
  const [location, setLocation] = useState<Position>([151.2313, -33.9173]); // UNSW Kensington Library Walk
  const [passage, setPassage] = useState<PassageRef>({
    presetPassageId: 'passage-library-walk',
    passageVersion: 1,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please provide a brief description of the obstacle.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const input: CreateReportInput = {
      photoId,
      analysisId: analysisId || undefined,
      category,
      description: description.trim(),
      location,
      observedAt: new Date().toISOString(),
      passage,
    };

    try {
      let report: PrivateReportDTO;
      try {
        report = await createReport(input, false);
      } catch {
        report = await createReport(input, true);
      }
      onReportCreated(report);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save report draft.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: '1px solid #d9e4de',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        background: '#ffffff',
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#163d36' }}>3. Verify Facts & Confirm Location</h3>
      <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#4e6961' }}>
        Review the factual details. You may refine the category, description, and target passage.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', color: '#163d36' }}>
            Obstacle Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ReportCategory)}
            disabled={disabled || isSubmitting}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.9rem' }}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', color: '#163d36' }}>
            Observation Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={disabled || isSubmitting}
            rows={3}
            maxLength={1000}
            placeholder="Describe the barrier or blockage..."
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.9rem' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#163d36' }}>
              Obstacle Coordinates (WGS84: Lng, Lat)
            </label>
            <button
              type="button"
              onClick={() => setLocation([151.2313, -33.9173])}
              disabled={disabled || isSubmitting}
              style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: '#006b50', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Reset to UNSW Library Walk
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="number"
              step="0.0001"
              value={location[0]}
              onChange={(e) => setLocation([parseFloat(e.target.value), location[1]])}
              disabled={disabled || isSubmitting}
              placeholder="Longitude"
              style={{ flex: 1, padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.85rem' }}
            />
            <input
              type="number"
              step="0.0001"
              value={location[1]}
              onChange={(e) => setLocation([location[0], parseFloat(e.target.value)])}
              disabled={disabled || isSubmitting}
              placeholder="Latitude"
              style={{ flex: 1, padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', color: '#163d36' }}>
            Affected Passage Reference
          </label>
          <select
            value={('presetPassageId' in passage && passage.presetPassageId) || 'preset'}
            onChange={(e) =>
              setPassage({
                presetPassageId: e.target.value,
                passageVersion: 1,
              })
            }
            disabled={disabled || isSubmitting}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.9rem' }}
          >
            <option value="passage-library-walk">Library Walk Main Ramp (Preset ID: passage-library-walk)</option>
            <option value="passage-ancete-walk">Anzac Parade Access Gate (Preset ID: passage-ancete-walk)</option>
            <option value="passage-quadrangle">Quadrangle North Entry (Preset ID: passage-quadrangle)</option>
          </select>
        </div>

        {error && (
          <div style={{ color: '#b91c1c', fontSize: '0.85rem', padding: '0.5rem', background: '#fef2f2', borderRadius: '0.375rem' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={disabled || isSubmitting || !description.trim()}
          style={{
            alignSelf: 'flex-start',
            padding: '0.6rem 1.25rem',
            background: '#006b50',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 600,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? 'Saving Report Draft...' : 'Save Report Draft & Continue to Avoidance'}
        </button>
      </div>
    </form>
  );
}
