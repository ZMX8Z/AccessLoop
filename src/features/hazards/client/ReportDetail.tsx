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
import type { ReportCategory } from './report-state'
import './report.css'

export function ReportDetail({ id }: { id: string }) {
  const [report, setReport] = useState<PrivateReportDTO | PublicReportDTO | null>(null)
  const [config, setConfig] = useState<{ region: RegionDTO; passages: PresetPassageDTO[] } | null>(null)
  const [owner, setOwner] = useState(false), [editing, setEditing] = useState(false), [error, setError] = useState('')
  const [reload, setReload] = useState(0), [now, setNow] = useState(0)
  const [category, setCategory] = useState<ReportCategory>('obstruction'), [description, setDescription] = useState('')
  const [photoId, setPhotoId] = useState<string | null>(null), [analysisId, setAnalysisId] = useState<string | undefined>()
  const [analysis, setAnalysis] = useState<AnalysisDTO | null>(null), [analyzing, setAnalyzing] = useState(false)
  const analysisRequests = useRef(new LatestRequest())
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([loadReportConfig(controller.signal), fetchReport(id, controller.signal), fetchReports('mine', controller.signal)])
      .then(([configuration, result, mine]) => { if (!controller.signal.aborted) { setConfig(configuration); setReport(result); setOwner(mine.items.some((item) => item.id === result.id)); setError('') } })
      .catch((failure) => { if (!controller.signal.aborted) setError(errorMessage(failure)) })
    return () => controller.abort()
  }, [id, reload])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); const requests = analysisRequests.current; return () => { clearInterval(timer); requests.cancel() } }, [])
  const privateReport = report && 'rowVersion' in report ? report : null
  const editable = owner && privateReport && privateReport.publicRevision === null && ['pending', 'ai_assessed'].includes(privateReport.status)
  function edit() {
    if (!privateReport) return
    setCategory(privateReport.category); setDescription(privateReport.description); setPhotoId(privateReport.photoId)
    setAnalysis(privateReport.analysis); setAnalysisId(privateReport.analysis?.analysisId); setEditing(true); setError('')
  }
  return <main className="report-flow"><nav><Link href="/reports">All reports</Link><Link href="/live">Plan a route</Link><Link href="/reports/new">New report</Link></nav><h1>Report details</h1>
    {error && <p className="report-error" role="alert">{error} No unavailable report is replaced with an example.</p>}
    {!report && !error && <p role="status">Loading this report…</p>}
    {report && <><ReportSummary report={report} now={now} />
      <button type="button" className="report-secondary" disabled={editing} onClick={() => setReload((value) => value + 1)}>Reload latest report</button>
      {privateReport && <section><h2>Private evidence</h2><img src={`/api/photos/${encodeURIComponent(privateReport.photoId)}`} alt="Photo attached by this report's author; authorized access only" />
        <p>AI state: {privateReport.analysis?.aiStatus ?? 'manual report'}. Original AI evidence is preserved separately from the facts.</p>
        {privateReport.analysis?.result && <pre>{JSON.stringify(privateReport.analysis.result, null, 2)}</pre>}
      </section>}
      {editable && !editing && <button type="button" onClick={edit}>Edit report facts / replace photo</button>}
      {editing && privateReport && config && <>
        <PhotoUpload onPhotoSelected={() => { analysisRequests.current.cancel(); setAnalyzing(false); setPhotoId(null); setAnalysis(null); setAnalysisId(undefined) }} onPhotoUploaded={(photo, _url, consent) => {
          setPhotoId(photo.photoId); setAnalysis(null); setAnalysisId(undefined)
          if (!consent) return
          const task = analysisRequests.current.begin(); setAnalyzing(true)
          void analyzePhoto(photo.photoId, createIdempotencyKey(), task.signal).then((result) => {
            if (task.current()) { setAnalysis(result); setAnalysisId(result.analysisId) }
          }).catch((failure) => { if (task.current()) setError(errorMessage(failure)) }).finally(() => { if (task.current()) setAnalyzing(false) })
        }} />
        <AIAnalysisFeedback analysis={analysis} isLoading={analyzing} onManualFallback={() => setAnalysisId(undefined)} onApplyFindings={(facts) => {
          setCategory(facts.category); setDescription(facts.description); setAnalysisId(facts.analysisId)
        }} />
        <ReportForm photoId={photoId ?? ''} analysisId={analysisId} category={category} description={description} disabled={!photoId || analyzing}
          region={config.region} passages={config.passages} initialReport={privateReport} onFactsChange={(value, text) => { setCategory(value); setDescription(text) }}
          onReportCreated={(updated) => { analysisRequests.current.cancel(); setReport(updated); setEditing(false) }} onCancel={() => { analysisRequests.current.cancel(); setEditing(false) }} />
        <button type="button" className="report-secondary" onClick={async () => {
          try { const result = await fetchReport(id); if ('rowVersion' in result) { setReport(result); setError('Latest version loaded. Your edited description, category and selected photo are retained. Review the new version before saving.') } }
          catch (failure) { setError(errorMessage(failure)) }
        }}>Load current version after a conflict · retain facts</button>
      </>}
      {owner && privateReport && config && !editing && <AvoidanceDrawer report={privateReport} region={config.region} passages={config.passages} onUpdated={setReport} />}
      {!owner && privateReport && <p className="report-note">You have authorized read access. Author controls require the original anonymous browser session.</p>}
    </>}
  </main>
}
