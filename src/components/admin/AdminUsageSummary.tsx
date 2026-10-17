'use client';

import React, { useCallback, useEffect, useState } from 'react';

import type { UsageSummaryData } from '../../shared/contracts';
import { fetchUsageSummary } from '../../features/hazards/client/api';

export function AdminUsageSummary() {
  const [data, setData] = useState<UsageSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let res: UsageSummaryData;
      try {
        res = await fetchUsageSummary(false);
      } catch {
        res = await fetchUsageSummary(true);
      }
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load usage summary.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function fetchInitial() {
      try {
        let res: UsageSummaryData;
        try {
          res = await fetchUsageSummary(false);
        } catch {
          res = await fetchUsageSummary(true);
        }
        if (!ignore) {
          setData(res);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load usage summary.');
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    fetchInitial();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div style={{ border: '1px solid #d9e4de', borderRadius: '0.75rem', padding: '1.25rem', background: '#ffffff', maxWidth: '44rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#163d36' }}>24-Hour Service Metrics & Cache Hits</h3>
        <button
          type="button"
          onClick={() => void loadMetrics()}
          disabled={isLoading}
          style={{
            fontSize: '0.75rem',
            padding: '0.3rem 0.6rem',
            background: '#f1f3f4',
            border: '1px solid #ced4da',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          {isLoading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {error && <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{error}</p>}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* ORS Metrics */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.75rem' }}>
            <h4 style={{ margin: '0 0 0.5rem', color: '#0f172a', fontSize: '0.95rem' }}>OpenRouteService (ORS)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div>Calls: <strong>{data.services.ors.calls}</strong></div>
              <div>Waits / Throttled: <strong>{data.services.ors.waits}</strong></div>
              <div>Errors: <strong style={{ color: data.services.ors.errors > 0 ? '#b91c1c' : '#137333' }}>{data.services.ors.errors}</strong></div>
              <div>Cache Hits: <strong style={{ color: '#006b50' }}>{data.services.ors.cacheHits}</strong></div>
            </div>
          </div>

          {/* Vision AI Metrics */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '0.75rem' }}>
            <h4 style={{ margin: '0 0 0.5rem', color: '#0f172a', fontSize: '0.95rem' }}>GLM Vision AI</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div>Calls: <strong>{data.services.vision.calls}</strong></div>
              <div>Waits: <strong>{data.services.vision.waits}</strong></div>
              <div>Errors: <strong style={{ color: data.services.vision.errors > 0 ? '#b91c1c' : '#137333' }}>{data.services.vision.errors}</strong></div>
              <div>Cache Hits: <strong style={{ color: '#006b50' }}>{data.services.vision.cacheHits}</strong></div>
            </div>
          </div>
        </div>
      )}

      {data && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#707d77' }}>
          Window: {new Date(data.windowStart).toLocaleDateString()} to {new Date(data.windowEnd).toLocaleDateString()}. Data aggregates real backend attempts.
        </p>
      )}
    </div>
  );
}
