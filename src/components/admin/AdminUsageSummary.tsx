'use client'

import { useState } from 'react'

import { ApiError, errorMessage, request } from '@/shared/client/api'
import { UsageSummarySchema, type UsageSummaryDTO } from '@/shared/contracts/route-result'

import './admin.css'

export function AdminUsageSummary({ initialData }: { initialData: UsageSummaryDTO }) {
  const [data, setData] = useState(initialData)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function refresh() {
    setPending(true); setError('')
    try { setData(await request('/api/admin/usage-summary', UsageSummarySchema)) }
    catch (failure) { setError(failure instanceof ApiError ? `${failure.code}: ${failure.message}` : errorMessage(failure)) }
    finally { setPending(false) }
  }
  return <section className="accessloop-admin" aria-label="Service usage summary"><div className="al-admin-card">
    <div className="al-admin-heading"><h2>Service usage · last 24 hours</h2><button type="button" disabled={pending} onClick={() => void refresh()}>{pending ? 'Refreshing…' : 'Refresh usage'}</button></div>
    <div className="al-admin-grid">{(['ors', 'vision'] as const).map((service) => <div className="al-admin-subsection" key={service}>
      <h3>{service === 'ors' ? 'Openrouteservice' : 'Vision service'}</h3><dl className="al-admin-metrics">
        <div><dt>Upstream calls</dt><dd>{data.services[service].calls}</dd></div>
        <div><dt>Waits / blocked attempts</dt><dd>{data.services[service].waits}</dd></div>
        <div><dt>Errors</dt><dd>{data.services[service].errors}</dd></div>
        <div><dt>Cache hits</dt><dd>{data.services[service].cacheHits}</dd></div>
      </dl>
    </div>)}</div>
    <p className="al-admin-note">Window: <time>{data.windowStart}</time> to <time>{data.windowEnd}</time>. Counts come from persisted service events. Valid uncertain analyses are not errors.</p>
    {error && <p className="al-admin-error" role="alert">{error} The last loaded values remain visible.</p>}
  </div></section>
}
