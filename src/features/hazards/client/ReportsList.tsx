'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { PrivateReportDTO, PublicReportDTO } from '@/shared/contracts/hazards'
import { errorMessage, LatestRequest } from '@/shared/client/api'
import { publicStatus } from '@/features/routing/client/state'
import { fetchReports } from './api'
import { isPersonalEffective } from './report-state'
import './report.css'

export function ReportSummary({ report, now }: { report: PrivateReportDTO | PublicReportDTO; now: number }) {
  const privateReport = 'rowVersion' in report ? report : null
  return <article><h2>{report.id}</h2><p className="report-status">{privateReport ? `${report.status} · private record v${privateReport.rowVersion}` : publicStatus(report as PublicReportDTO, now)}</p>
    {report.isDemo && <p className="report-note">Demonstration record · not a surveyed campus result.</p>}
    <p>{report.description}</p><p>Category: {report.category.replaceAll('_', ' ')}. Observed {report.observedAt}.</p>
    {privateReport && <p>Personal avoidance: {isPersonalEffective(privateReport, now) ? "effective for the report author's session" : privateReport.personalAvoidance?.active ? 'expired or confirmation invalidated' : 'not enabled'}. This is separate from public verification.</p>}
    {report.publicVerification && <p className="report-note">Public revision {report.publicRevision} · {report.publicActivity}. Source: {report.publicVerification.source === 'admin_field_check' ? 'independent administrator field check' : 'trusted maintainer'}. Verified {report.publicVerification.verifiedAt}; valid until {report.publicVerification.validUntil}.
      {report.publicVerification.resolvedAt && ` Resolved ${report.publicVerification.resolvedAt}.`} Expiry does not mean the passage is clear.</p>}
    <div className="report-actions"><Link className="report-link" href={`/reports/${encodeURIComponent(report.id)}`}>Open report</Link><a className="report-link" href={`/api/reports/${encodeURIComponent(report.id)}/export`} target="_blank" rel="noreferrer">Copy / print</a></div>
  </article>
}
export function ReportsList() {
  const [scope, setScope] = useState<'mine' | 'public'>('mine')
  const [items, setItems] = useState<(PrivateReportDTO | PublicReportDTO)[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [truncated, setTruncated] = useState(false)
  const [now, setNow] = useState(0), [reload, setReload] = useState(0)
  const latest = useRef(new LatestRequest())
  useEffect(() => {
    const requests = latest.current
    let pending = false
    async function load() {
      if (pending) return
      pending = true
      const task = requests.begin()
      try {
        const result = await fetchReports(scope, task.signal)
        if (task.current()) { setItems(result.items); setTruncated(result.truncated); setError('') }
      } catch (failure) { if (task.current()) setError(errorMessage(failure)) }
      finally { pending = false; if (task.current()) setLoading(false) }
    }
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => { clearInterval(timer); requests.cancel() }
  }, [scope, reload])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  return <main className="report-flow"><nav><Link href="/live">Plan a route</Link><Link href="/reports/new">Report an obstacle</Link></nav><h1>Obstacle reports</h1>
    <p>Your reports belong to this browser session. Public reports show the separately approved publication. Private evidence is not published.</p>
    <div className="report-actions">{(['mine', 'public'] as const).map((value) => <button type="button" key={value} aria-pressed={scope === value} className={scope === value ? '' : 'report-secondary'} onClick={() => {
      if (value !== scope) { latest.current.cancel(); setItems([]); setLoading(true); setError(''); setScope(value) }
    }}>{value === 'mine' ? 'My session reports' : 'Public reports and history'}</button>)}
      <button type="button" className="report-secondary" onClick={() => { setLoading(true); setReload((value) => value + 1) }}>Refresh</button></div>
    {loading && <p role="status">Loading reports…</p>}
    {error && <p role="alert" className="report-error">{error} Current reports could not be verified. Previously loaded records may be outdated.</p>}
    {!loading && !error && !items.length && <p>No reports were returned. This does not confirm clear passage.</p>}
    {truncated && <p className="report-note">This list is limited; it is not a complete inventory.</p>}
    {items.map((report) => <ReportSummary report={report} now={now} key={report.id} />)}
  </main>
}
