'use client'
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { PrivateReportDTO, PublicReportDTO } from '@/shared/contracts/hazards'
import type { AnalysisDTO } from '@/shared/contracts/vision'
import type { RegionDTO, PresetPassageDTO } from '@/shared/contracts/region'
import { createIdempotencyKey, errorMessage, LatestRequest } from '@/shared/client/api'
import { analyzePhoto, fetchReport, fetchReports, loadReportConfig } from './api'
import { ReportForm } from './ReportForm'
import { PhotoUpload } from './PhotoUpload'
import { AIAnalysisFeedback } from './AIAnalysisFeedback'
import { AvoidanceDrawer } from './AvoidanceDrawer'
import { ReportSummary } from './ReportsList'
import {isPersonalEffective, type ReportCategory} from './report-state'
import './report.css'

export function ReportDetail({ id, returnTo = '/my-reports', onNavigate, onChanged }: {
  id: string; returnTo?: string; onNavigate?: (path: string) => void; onChanged?: () => void
}) {
  const [report, setReport] = useState<PrivateReportDTO | PublicReportDTO | null>(null)
  const [config, setConfig] = useState<{ region: RegionDTO; passages: PresetPassageDTO[] } | null>(null)
  const [mineTruncated, setMineTruncated] = useState(false)
  const [owner, setOwner] = useState(false), [editing, setEditing] = useState(false), [error, setError] = useState('')
  const [reload, setReload] = useState(0), [now, setNow] = useState(0)
  const [category, setCategory] = useState<ReportCategory>('obstruction'), [description, setDescription] = useState('')
  const [photoId, setPhotoId] = useState<string | null>(null), [analysisId, setAnalysisId] = useState<string | undefined>()
  const [analysis, setAnalysis] = useState<AnalysisDTO | null>(null), [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false), [editorEpoch, setEditorEpoch] = useState(0)
  const [copyState, setCopyState] = useState('')
  const editorGeneration = useRef(0)
  const analysisRequests = useRef(new LatestRequest())
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([loadReportConfig(controller.signal), fetchReport(id, controller.signal), fetchReports('mine', controller.signal)])
      .then(([configuration, result, mine]) => { if (!controller.signal.aborted) { setConfig(configuration); setReport(result); setOwner(mine.items.some((item) => item.id === result.id)); setMineTruncated(mine.truncated); setError('') } })
      .catch((failure) => { if (!controller.signal.aborted) setError(errorMessage(failure)) })
    return () => controller.abort()
  }, [id, reload])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); const requests = analysisRequests.current; return () => { clearInterval(timer); requests.cancel() } }, [])
  const privateReport = report?.id === id && 'rowVersion' in report ? report : null
  const authorActions = owner || mineTruncated
  const editable = authorActions && privateReport && privateReport.publicRevision === null && ['pending', 'ai_assessed'].includes(privateReport.status)
  function nextEditor() { editorGeneration.current++; setEditorEpoch(editorGeneration.current) }
  function edit() {
    if (!privateReport) return
    nextEditor(); setCategory(privateReport.category); setDescription(privateReport.description); setPhotoId(privateReport.photoId)
    setAnalysis(privateReport.analysis); setAnalysisId(privateReport.analysis?.analysisId); setEditing(true); setError('')
  }
  function notifyChanged() {
    onChanged?.()
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('accessloop:reports-changed'))
  }
  function navigate(event: React.MouseEvent<HTMLAnchorElement>, path: string) {
    if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(path) }
  }
  async function copyReport() {
    if (!report || report.id !== id) return
    const text = [`AccessLoop report #${report.id}`, report.description, `Category: ${report.category}`, `Observed: ${report.observedAt}`,
      `Location: ${report.location[1]}, ${report.location[0]}`, `Lifecycle: ${report.status}`, `Public activity: ${report.publicActivity === 'active' && report.publicVerification && Date.parse(report.publicVerification.validUntil) <= Date.now() ? 'expired' : report.publicActivity}`,
      ...(report.publicVerification ? [`Public validity: ${report.publicVerification.verifiedAt} to ${report.publicVerification.validUntil}`] : []),
      ...(privateReport ? [`AI: ${privateReport.analysis?.aiStatus ?? 'manual report'}`, `Personal avoidance: ${isPersonalEffective(privateReport,Date.now()) ? "effective for the report author's session" : 'not effective'}${privateReport.personalAvoidance ? ` · valid until ${privateReport.personalAvoidance.validUntil}` : ''}`] : []),
      'Expiry does not confirm clear passage. No facilities dispatch is claimed.'].join('\n')
    try { await navigator.clipboard.writeText(text); setCopyState('Report text copied.') }
    catch { setCopyState('Copy is unavailable. Open the authorized printable report to select and copy the text.') }
  }
  return <section className="report-flow report-detail" data-report-page="detail"><nav aria-label="Report detail navigation"><Link href={returnTo} onClick={(event) => navigate(event, returnTo)}>← {returnTo === '/route' ? 'Back to Route' : 'Back to My Reports'}</Link><Link href="/report" onClick={(event) => navigate(event, '/report')}>New report</Link></nav><h1>Report details</h1>
    {error && <p className="report-error" role="alert">{error} No unavailable report is replaced with an example.</p>}
    {(!report || report.id !== id) && !error && <p role="status">Loading this report…</p>}
    {report?.id === id && <><ReportSummary report={report} now={now} onNavigate={onNavigate} />
      <div className="report-actions"><button type="button" className="report-secondary" onClick={() => void copyReport()}>Copy report text</button><a className="report-link report-secondary" href={`/api/reports/${encodeURIComponent(report.id)}/export`} target="_blank" rel="noreferrer">Open authorized print view</a><Link className="report-link report-secondary" href="/route" onClick={(event) => navigate(event, '/route')}>View Route</Link></div>{copyState && <p role="status">{copyState}</p>}
      <button type="button" className="report-secondary" disabled={editing} onClick={() => setReload((value) => value + 1)}>Reload latest report</button>
      {privateReport && <section><h2>Private evidence</h2><img src={`/api/photos/${encodeURIComponent(privateReport.photoId)}`} alt="Photo attached by this report's author; authorized access only" />
        <p>AI state: {privateReport.analysis?.aiStatus ?? 'manual report'}. Original AI evidence is preserved separately from the facts.</p>
        {privateReport.analysis?.result && <pre>{JSON.stringify(privateReport.analysis.result, null, 2)}</pre>}
      </section>}
      {editable && !editing && <button type="button" onClick={edit}>Edit report facts / replace photo</button>}
      {editing && privateReport && config && <>
        <PhotoUpload disabled={saving} onPhotoSelected={() => { nextEditor(); analysisRequests.current.cancel(); setAnalyzing(false); setPhotoId(null); setAnalysis(null); setAnalysisId(undefined) }} onPhotoUploaded={(photo, _url, consent) => {
          nextEditor(); setPhotoId(photo.photoId); setAnalysis(null); setAnalysisId(undefined)
          if (!consent) return
          const task = analysisRequests.current.begin(); setAnalyzing(true)
          void analyzePhoto(photo.photoId, createIdempotencyKey(), task.signal).then((result) => {
            if (task.current()) { setAnalysis(result); setAnalysisId(result.analysisId) }
          }).catch((failure) => { if (task.current()) setError(errorMessage(failure)) }).finally(() => { if (task.current()) setAnalyzing(false) })
        }} />
        <AIAnalysisFeedback analysis={analysis} isLoading={analyzing} onManualFallback={() => { analysisRequests.current.cancel(); setAnalyzing(false); setError(''); setAnalysis(null); setAnalysisId(undefined) }} onApplyFindings={(facts) => {
          setCategory(facts.category); setDescription(facts.description); setAnalysisId(facts.analysisId)
        }} />
        <ReportForm photoId={photoId ?? ''} analysisId={analysisId} category={category} description={description} disabled={!photoId || analyzing}
          region={config.region} passages={config.passages} initialReport={privateReport} onFactsChange={(value, text) => { setCategory(value); setDescription(text) }}
          onSavingChange={setSaving} onReportCreated={(updated) => {
            notifyChanged()
            setReport((current) => current && 'rowVersion' in current && current.rowVersion > updated.rowVersion ? current : updated)
            if (editorGeneration.current !== editorEpoch) {
              setError(`The earlier correction was saved as version ${updated.rowVersion}. Your replacement draft remains open; review it before saving.`)
              return
            }
            nextEditor(); analysisRequests.current.cancel(); setEditing(false)
          }} onCancel={() => { nextEditor(); analysisRequests.current.cancel(); setAnalyzing(false); setEditing(false) }} />
        <button type="button" className="report-secondary" disabled={saving} onClick={async () => {
          try { const result = await fetchReport(id); if ('rowVersion' in result) { setReport(result); setError('Latest version loaded. Your edited description, category and selected photo are retained. Review the new version before saving.') } }
          catch (failure) { setError(errorMessage(failure)) }
        }}>Load current version after a conflict · retain facts</button>
      </>}
      {authorActions && privateReport && config && !editing && <AvoidanceDrawer report={privateReport} region={config.region} passages={config.passages} onUpdated={(updated) => { setReport(updated); notifyChanged() }} />}
      {!owner && privateReport && <p className="report-note">{mineTruncated ? 'Ownership could not be confirmed from the limited report list. Author actions require the original session; the server checks ownership for every change.' : 'You have authorized read access. Author controls require the original anonymous browser session.'}</p>}
    </>}
  </section>
}
