'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { PrivateReportDTO, PublicReportDTO } from '@/shared/contracts/hazards'
import { errorMessage, LatestRequest } from '@/shared/client/api'
import { publicStatus } from '@/features/routing/client/state'
import { fetchReports } from './api'
import { filterMyReports, isPersonalEffective, type MyReportsFilter } from './report-state'
import './report.css'

export function ReportSummary({ report, now, compact = false, onNavigate }: {
  report: PrivateReportDTO | PublicReportDTO; now: number; compact?: boolean; onNavigate?: (path: string) => void
}) {
  const privateReport = 'rowVersion' in report ? report : null
  const active = privateReport && isPersonalEffective(privateReport, now)
  const path = `/${privateReport ? 'my-reports' : 'route/barriers'}/${encodeURIComponent(report.id)}`
  const label = active ? 'Active Detour' : report.status === 'resolved' ? 'Resolved' : privateReport ? report.status.replaceAll('_', ' ') : publicStatus(report as PublicReportDTO, now)
  function open(event: React.MouseEvent<HTMLAnchorElement>) { if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(path) } }
  return <article className={`report-record ${compact ? 'report-record-compact' : ''}`}>
    <div className="report-record-heading"><h2>{report.category.replaceAll('_', ' ')} <span>#{report.id}</span></h2><p className={`report-status ${active ? 'report-status-active' : ''}`}>{label}</p></div>
    <p className="report-record-location"><span aria-hidden="true">⌖</span> {report.location[1].toFixed(5)}, {report.location[0].toFixed(5)}</p>
    <p className="report-record-description">{report.description}</p>
    <p className="report-note">Observed {report.observedAt}{active ? ` · Personal detour until ${privateReport!.personalAvoidance!.validUntil}` : ''}</p>
    {report.isDemo && <p className="report-note">Demonstration record · not a surveyed campus result.</p>}
    {!compact && <>
      {privateReport && <p>Personal avoidance: {active ? "effective for the report author's session" : privateReport.personalAvoidance?.active ? 'expired or confirmation invalidated' : 'not enabled'}. This is separate from public verification.</p>}
      {report.publicVerification && <p className="report-note">Public revision {report.publicRevision} · {report.publicActivity}. Source: {report.publicVerification.source === 'admin_field_check' ? 'independent administrator field check' : 'trusted maintainer'}. Verified {report.publicVerification.verifiedAt}; valid until {report.publicVerification.validUntil}.
        {report.publicVerification.resolvedAt && ` Resolved ${report.publicVerification.resolvedAt}.`} Expiry does not mean the passage is clear.</p>}
    </>}
    <div className="report-actions"><Link className={compact ? 'report-open-record' : 'report-link'} href={path} onClick={open}>{compact ? <>View report <span aria-hidden="true">›</span></> : 'Open report'}</Link>{!compact && <a className="report-link report-secondary" href={`/api/reports/${encodeURIComponent(report.id)}/export`} target="_blank" rel="noreferrer">Authorized copy / print</a>}</div>
  </article>
}
export function ReportsList({ onNavigate, refreshKey }: { onNavigate?: (path: string) => void; refreshKey?: number } = {}) {
  const [scope, setScope] = useState<'mine' | 'public'>('mine')
  const [filter, setFilter] = useState<MyReportsFilter>('all')
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
  }, [scope, reload, refreshKey])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    const update = () => setReload((value) => value + 1)
    window.addEventListener('accessloop:reports-changed', update)
    return () => window.removeEventListener('accessloop:reports-changed', update)
  }, [])
  const mine = items.filter((report): report is PrivateReportDTO => 'rowVersion' in report)
  const visible = scope === 'mine' ? filterMyReports(mine, filter, now) : items
  function changeScope(next: 'mine' | 'public') {
    if (next === scope) return
    latest.current.cancel(); setItems([]); setLoading(true); setError(''); setScope(next)
  }
  return <main className="report-flow reports-list" data-report-page="my-reports">
    <div className="reports-list-title"><h1>{scope === 'mine' ? 'My Reports' : 'Public reports'}</h1><span className="report-total">{items.length}{truncated ? '+' : ''} total</span><button type="button" className="report-icon-button" aria-label="Refresh reports" onClick={() => { setLoading(true); setReload((value) => value + 1) }}>↻</button></div>
    <p className="report-note">{scope === 'mine' ? 'Private records for this browser session. Expiry does not mean a barrier is resolved.' : 'Separately approved public information and history. Private photos and analysis are not published.'}</p>
    {scope === 'mine' && <div className="report-filters" role="group" aria-label="Filter my reports">{(['all', 'active', 'resolved'] as const).map((value) => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? 'is-selected' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'active' ? 'Active Detour' : 'Resolved'}<span>{filterMyReports(mine, value, now).length}</span></button>)}</div>}
    {loading && <p role="status">Loading reports…</p>}
    {error && <p role="alert" className="report-error">{error} Current reports could not be verified. Previously loaded records may be outdated.</p>}
    {!loading && !error && !visible.length && <section className="report-empty"><h2>{items.length ? 'No matching reports' : 'No reports yet'}</h2><p>{items.length ? 'Try another filter. An expired personal detour is not automatically resolved.' : 'No reports were returned. This does not confirm clear passage.'}</p>{scope === 'mine' && <Link className="report-link" href="/report" onClick={(event) => { if (onNavigate) { event.preventDefault(); onNavigate('/report') } }}>Report a barrier</Link>}</section>}
    {truncated && <p className="report-note">This list is limited; it is not a complete inventory.</p>}
    <div className="report-records">{visible.map((report) => <ReportSummary report={report} now={now} key={report.id} compact onNavigate={onNavigate} />)}</div>
    <button className="report-secondary report-public-toggle" type="button" onClick={() => changeScope(scope === 'mine' ? 'public' : 'mine')}>{scope === 'mine' ? 'View public reports and history' : 'Return to My Reports'}</button>
  </main>
}
