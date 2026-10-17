'use client'
import Link from 'next/link'
import { useEffect, useReducer, useRef, useState } from 'react'
import type { PrivateReportDTO } from '@/shared/contracts/hazards'
import type { RegionDTO, PresetPassageDTO } from '@/shared/contracts/region'
import type { RouteDTO } from '@/shared/contracts'
import { LatestRequest, createIdempotencyKey, errorMessage } from '@/shared/client/api'
import { analyzePhoto, loadReportConfig } from './api'
import { draftReducer, initialDraft } from './report-state'
import { PhotoUpload } from './PhotoUpload'
import { AIAnalysisFeedback } from './AIAnalysisFeedback'
import { ReportForm } from './ReportForm'
import { AvoidanceDrawer } from './AvoidanceDrawer'
import './report.css'

export function ReportWizard({ region: suppliedRegion, passages: suppliedPassages, route = null, onChanged }: {
  region?: RegionDTO; passages?: PresetPassageDTO[]; route?: RouteDTO | null; onChanged?: () => void
}) {
  const [draft, dispatch] = useReducer(draftReducer, initialDraft)
  const [report, setReport] = useState<PrivateReportDTO | null>(null)
  const [config, setConfig] = useState<{ region: RegionDTO; passages: PresetPassageDTO[] } | null>(null)
  const [error, setError] = useState(''), [analyzing, setAnalyzing] = useState(false), [reload, setReload] = useState(0)
  const currentPhoto = useRef<string | null>(null)
  const analysisRequest = useRef(new LatestRequest())
  const region = suppliedRegion ?? config?.region
  const passages = suppliedPassages ?? config?.passages ?? []
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const load = async () => {
      if (suppliedRegion || pending) return
      pending = true
      try { const value = await loadReportConfig(controller.signal); if (!controller.signal.aborted) setConfig(value) }
      catch (failure) { if (!controller.signal.aborted) setError(errorMessage(failure)) }
      finally { pending = false }
    }
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [suppliedRegion, reload])
  useEffect(() => { const requests = analysisRequest.current; return () => requests.cancel() }, [])
  function changed(updated: PrivateReportDTO) { setReport(updated); onChanged?.() }
  async function analyze() {
    if (!draft.photo) return
    const task = analysisRequest.current.begin()
    setAnalyzing(true); setError('')
    try {
      const analysis = await analyzePhoto(draft.photo.photoId, createIdempotencyKey(), task.signal)
      if (task.current()) dispatch({ type: 'analysis', analysis })
    } catch (failure) { if (task.current()) setError(`${errorMessage(failure)} Continue with your own facts; no AI result was created.`) }
    finally { if (task.current()) setAnalyzing(false) }
  }
  return <div className="report-flow"><nav><Link href="/live">Plan a route</Link><Link href="/reports">My and public reports</Link><Link href="/admin">Administration</Link></nav>
    <h1>Report a passage obstacle</h1>
    {region?.isDemo && <p className="report-note">Demonstration region. Use actual observations when reporting; demonstration data is not a surveyed campus result.</p>}
    <p>A report and a personal avoidance are separate steps. Your photo remains private. Closing the browser may lose this anonymous identity.</p>
    {!report && <>
      <PhotoUpload onPhotoSelected={() => {
        analysisRequest.current.cancel(); currentPhoto.current = null; setAnalyzing(false); dispatch({ type: 'photo', photo: null }); setError('')
      }} onPhotoUploaded={(photo, _url, consent) => {
        currentPhoto.current = photo.photoId; dispatch({ type: 'photo', photo }); setError('')
        if (consent) {
          const task = analysisRequest.current.begin(); setAnalyzing(true)
          void analyzePhoto(photo.photoId, createIdempotencyKey(), task.signal).then((analysis) => {
            if (task.current()) dispatch({ type: 'analysis', analysis })
          }).catch((failure) => { if (task.current()) setError(`${errorMessage(failure)} Continue manually; no AI result was created.`) })
            .finally(() => { if (task.current()) setAnalyzing(false) })
        }
      }} />
      {draft.photo && <>
        <AIAnalysisFeedback analysis={draft.analysis} isLoading={analyzing}
          onApplyFindings={() => dispatch({ type: 'apply_analysis' })} onManualFallback={() => dispatch({ type: 'manual' })} />
        <p className="report-note">{draft.analysisId ? 'The saved AI record will be attached. Your facts remain editable.' : 'Manual report: no analysis is attached.'}</p>
        {draft.analysis?.aiStatus === 'unavailable' && <button type="button" disabled={analyzing} onClick={() => void analyze()}>I choose to retry external AI analysis</button>}
        <ReportForm photoId={draft.photo.photoId} analysisId={draft.analysisId} category={draft.category} description={draft.description}
          onFactsChange={(category, description) => dispatch({ type: 'facts', category, description })}
          region={region} passages={passages} route={route} onReportCreated={(created) => {
            if (created.photoId === currentPhoto.current) changed(created)
            else { onChanged?.(); setError(`A report for the previous photo was saved as ${created.id}. Your new photo draft is unchanged; find the earlier report in My session reports.`) }
          }} />
      </>}
    </>}
    {report && <>
      <section><h2>Report saved</h2><p>Report {report.id} · {report.status} · version {report.rowVersion}. Public activity: {report.publicActivity}.</p>
        <Link className="report-link" href={`/reports/${encodeURIComponent(report.id)}`}>View or correct report</Link>
        <a className="report-link" href={`/api/reports/${encodeURIComponent(report.id)}/export`} target="_blank" rel="noreferrer">Copy / print report</a>
      </section>
      {region && <AvoidanceDrawer report={report} region={region} passages={passages} route={route} onUpdated={changed} />}
      <button type="button" onClick={() => { analysisRequest.current.cancel(); currentPhoto.current = null; dispatch({ type: 'reset' }); setReport(null); setError('') }}>Report another obstacle</button>
    </>}
    {error && <p className="report-error" role="alert">{error} <button type="button" onClick={() => { setError(''); setReload((value) => value + 1) }}>Reload configuration</button></p>}
  </div>
}
