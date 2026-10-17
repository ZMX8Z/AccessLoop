'use client';

import React, { useCallback, useEffect, useState } from 'react';

import type { AdminRegionConfigResponse, RegionPatchInput } from '../../shared/contracts';
import { fetchAdminRegionConfig, patchAdminRegionConfig } from '../../features/hazards/client/api';

export function AdminRegionConfig() {
  const [config, setConfig] = useState<AdminRegionConfigResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form editable fields
  const [bufferMeters, setBufferMeters] = useState(2.0);
  const [isDemo, setIsDemo] = useState(true);
  const [reason, setReason] = useState('');

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let res: AdminRegionConfigResponse;
      try {
        res = await fetchAdminRegionConfig(false);
      } catch {
        res = await fetchAdminRegionConfig(true);
      }
      setConfig(res);
      setBufferMeters(res.region.avoidanceBufferM);
      setIsDemo(res.region.isDemo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load region configuration.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        let res: AdminRegionConfigResponse;
        try {
          res = await fetchAdminRegionConfig(false);
        } catch {
          res = await fetchAdminRegionConfig(true);
        }
        if (!ignore) {
          setConfig(res);
          setBufferMeters(res.region.avoidanceBufferM);
          setIsDemo(res.region.isDemo);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load configuration.');
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    if (!reason.trim()) {
      setError('An operator reason is required to update region configuration.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const patchInput: RegionPatchInput = {
      expectedVersion: config.region.configVersion,
      reason: reason.trim(),
      changes: {
        avoidanceBufferM: bufferMeters,
        isDemo,
      },
    };

    try {
      let updated: AdminRegionConfigResponse;
      try {
        updated = await patchAdminRegionConfig(patchInput, false);
      } catch {
        updated = await patchAdminRegionConfig(patchInput, true);
      }
      setConfig(updated);
      setSuccess(`Region configuration updated to version ${updated.region.configVersion}.`);
      setReason('');
    } catch (err: unknown) {
      // Retain inputs on conflict or error
      setError(err instanceof Error ? err.message : 'Failed to update configuration. Inputs retained.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <p style={{ color: '#4e6961' }}>Loading region configuration...</p>;
  }

  if (!config) {
    return <p style={{ color: '#b91c1c' }}>No region configuration available.</p>;
  }

  const { region, presetPassages } = config;

  return (
    <div style={{ border: '1px solid #d9e4de', borderRadius: '0.75rem', padding: '1.25rem', background: '#ffffff', maxWidth: '44rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem', color: '#163d36' }}>
            Region Operation & Passages
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#4e6961' }}>
            Operator parameters for <strong>{region.name}</strong> ({region.id})
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadConfig()}
          disabled={isSubmitting}
          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', background: '#f1f3f4', border: '1px solid #ced4da', borderRadius: '0.25rem', cursor: 'pointer' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Region Status summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', background: '#fafcfb', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
        <div>Config Version: <strong>{region.configVersion}</strong></div>
        <div>Hazard Version: <strong>{region.hazardVersion}</strong></div>
        <div>Timezone: <strong>{region.timezone}</strong></div>
        <div>Demo Flag: <strong>{region.isDemo ? 'Yes' : 'No'}</strong></div>
      </div>

      <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
        <strong style={{ color: '#163d36' }}>Operational BBox (WGS84 [West, South, East, North]):</strong>
        <div style={{ fontFamily: 'monospace', color: '#4e6961', marginTop: '0.2rem' }}>
          [{region.bbox.map((n) => n.toFixed(5)).join(', ')}]
        </div>
      </div>

      {/* Preset passages */}
      <div style={{ marginBottom: '1rem' }}>
        <strong style={{ fontSize: '0.85rem', color: '#163d36' }}>
          Registered Preset Passages ({presetPassages.length}):
        </strong>
        <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#4e6961' }}>
          {presetPassages.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> (<code>{p.id}</code>, v{p.passageVersion})
            </li>
          ))}
        </ul>
      </div>

      {/* Update Form */}
      <form onSubmit={handleSubmit} style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#163d36' }}>Update Region Parameters</h4>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', color: '#163d36' }}>
            Obstacle Avoidance Buffer: {bufferMeters.toFixed(1)} meters (Allowed: 0.5m – 5.0m)
          </label>
          <input
            type="range"
            min="0.5"
            max="5.0"
            step="0.1"
            value={bufferMeters}
            onChange={(e) => setBufferMeters(parseFloat(e.target.value))}
            disabled={isSubmitting}
            style={{ width: '100%' }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isDemo}
            onChange={(e) => setIsDemo(e.target.checked)}
            disabled={isSubmitting}
          />
          <span><strong>Enable Demo Mode</strong> (Allows rapid simulation on Kensington campus)</span>
        </label>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem', color: '#163d36' }}>
            Operator Reason (Required, 1-1000 characters)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
            placeholder="Reason for modifying region parameters or buffer..."
            style={{ width: '100%', padding: '0.4rem', borderRadius: '0.375rem', border: '1px solid #ced4da', fontSize: '0.85rem' }}
          />
        </div>

        {error && (
          <div style={{ color: '#b91c1c', background: '#fef2f2', padding: '0.5rem', borderRadius: '0.375rem', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ color: '#137333', background: '#e6f4ea', padding: '0.5rem', borderRadius: '0.375rem', fontSize: '0.85rem' }}>
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !reason.trim()}
          style={{
            alignSelf: 'flex-start',
            padding: '0.5rem 1.2rem',
            background: '#006b50',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            fontWeight: 600,
            cursor: isSubmitting || !reason.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? 'Updating...' : 'Save Region Configuration'}
        </button>
      </form>
    </div>
  );
}
