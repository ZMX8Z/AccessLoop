'use client'
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { useEffect, useReducer, useRef, useState } from 'react'
import type { UploadDTO } from '@/shared/contracts/photos'
import type { PrivateReportDTO } from '@/shared/contracts/hazards'
import type { RegionDTO, PresetPassageDTO } from '@/shared/contracts/region'
import type { RouteDTO } from '@/shared/contracts'
import { LatestRequest, createIdempotencyKey, errorMessage } from '@/shared/client/api'
import { analyzePhoto, fetchReport, fetchReports, loadReportConfig } from './api'
import { draftReducer, initialDraft, isPersonalEffective } from './report-state'
import { PhotoUpload } from './PhotoUpload'
import { AIAnalysisFeedback } from './AIAnalysisFeedback'
import { ReportForm } from './ReportForm'
import { AvoidanceDrawer } from './AvoidanceDrawer'
import './report.css'

type Step = 'photo' | 'confirm' | 'success'
const savedReportKey = (id: string | undefined, page: string, context: string | undefined, reload: number) => JSON.stringify([id, page, context, reload])
export function ReportWizard({ region: suppliedRegion, passages: suppliedPassages, route = null, onChanged,
  pathname, returnTo = '/route', onNavigate, onStepChange, reportUpdateKey }: {
  region?: RegionDTO; passages?: PresetPassageDTO[]; route?: RouteDTO | null; onChanged?: () => void
  pathname?: string; returnTo?: string; onNavigate?: (path: string) => void; onStepChange?: (step: Step) => void; reportUpdateKey?: string
}) {
  const [draft, dispatch] = useReducer(draftReducer, initialDraft)
  const [report, setReport] = useState<PrivateReportDTO | null>(null)
  const [savedCheck, setSavedCheck] = useState<{key: string; status: 'current' | 'unavailable'}>({key: '', status: 'unavailable'})
  const [completedId, setCompletedId] = useState<string | null>(null)
  const [localPath, setLocalPath] = useState('/report')
  const [photoUrl, setPhotoUrl] = useState(''), [photoEpoch, setPhotoEpoch] = useState(0)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(0)
  const [config, setConfig] = useState<{ region: RegionDTO; passages: PresetPassageDTO[] } | null>(null)
  const [configError, setConfigError] = useState('')
  const [error, setError] = useState(''), [analyzing, setAnalyzing] = useState(false), [reload, setReload] = useState(0)
  const currentPhoto = useRef<string | null>(null)
  const currentSavedReport = useRef<string | null>(null)
  const photoDraftStarted = useRef(false)
  const analysisRequest = useRef(new LatestRequest())
  const resumeRequest = useRef(new LatestRequest())
  const savedRequest = useRef(new LatestRequest())
  const region = suppliedRegion ?? config?.region
  const passages = suppliedPassages ?? config?.passages ?? []
  const path = pathname ?? localPath
  const [previousPath, setPreviousPath] = useState(path)
  if (previousPath !== path) { setPreviousPath(path); setSavedCheck({key: '', status: 'unavailable'}) }
  const step: Step = path.startsWith('/report/success/') ? 'success' : path === '/report/confirm' ? 'confirm' : 'photo'
  const savedStatus = savedCheck.key === savedReportKey(report?.id, path, reportUpdateKey, reload) ? savedCheck.status : 'checking'
  const validSuccess = !!report && completedId === report.id && path === `/report/success/${encodeURIComponent(report.id)}`
  function navigate(next: string) { resumeRequest.current.cancel(); savedRequest.current.cancel(); setLocalPath(next); onNavigate?.(next) }
  useEffect(() => { onStepChange?.(step) }, [step, onStepChange])
  useEffect(() => {
    const requests = resumeRequest.current
    const match = /^\/report\/success\/([^/]+)$/.exec(path)
    if (!match || draft.photo || report || photoDraftStarted.current) return
    let id: string
    try { id = decodeURIComponent(match[1]) } catch { return }
    if (!id) return
    const task = requests.begin()
    // Only the author's currently effective, server-confirmed report can
    // recover this completion screen. Authorized private reads alone do not
    // prove ownership, and a URL never supplies confirmation consent.
    void Promise.all([fetchReport(id, task.signal), fetchReports('mine', task.signal)]).then(([record, mine]) => {
      if (!task.current() || record.id !== id || !('rowVersion' in record)
        || !mine.items.some((item) => item.id === id) || !isPersonalEffective(record, Date.now())) return
      currentSavedReport.current = record.id; setReport(record); setCompletedId(record.id); setNow(Date.now()); setSavedCheck({key: savedReportKey(record.id, path, reportUpdateKey, reload), status: 'current'})
    }).catch(() => { /* Keep the guarded page when either read fails. */ })
    return () => requests.cancel()
  }, [path, draft.photo, report, reportUpdateKey, reload])
  const savedId = report?.id
  useEffect(() => {
    if (!savedId || (path !== '/report/confirm' && !path.startsWith('/report/success/'))) return
    const requests = savedRequest.current, task = requests.begin()
    void Promise.all([fetchReport(savedId, task.signal), fetchReports('mine', task.signal)]).then(([record, mine]) => {
      if (!task.current()) return
      if (!('rowVersion' in record) || record.id !== savedId || !mine.items.some(item => item.id === savedId)) throw new Error('Your saved report is no longer available to this session.')
      setReport(current => current?.id !== record.id || current.rowVersion > record.rowVersion ? current : record)
      setSavedCheck({key: savedReportKey(record.id, path, reportUpdateKey, reload), status: 'current'}); setError('')
    }).catch(failure => {
      if (task.current()) { setSavedCheck({key: savedReportKey(savedId, path, reportUpdateKey, reload), status: 'unavailable'}); setError(errorMessage(failure)) }
    })
    return () => requests.cancel()
  }, [savedId, path, reportUpdateKey, reload])
  useEffect(() => {
    if (!savedId || typeof window === 'undefined') return
    const changed = () => { savedRequest.current.cancel(); setReload(value => value + 1) }
    window.addEventListener('accessloop:reports-changed', changed)
    return () => window.removeEventListener('accessloop:reports-changed', changed)
  }, [savedId])
  useEffect(() => {
    if (path !== '/report' || !completedId) return
    // A new Report entry after completion starts a separate draft. Merely hiding
    // this mounted flow on Route or My Reports must preserve unfinished work.
    const timer = setTimeout(() => {
      analysisRequest.current.cancel(); currentPhoto.current = null; currentSavedReport.current = null; photoDraftStarted.current = false
      dispatch({ type: 'reset' }); setReport(null); setCompletedId(null)
      setPhotoUrl(''); setPhotoEpoch((value) => value + 1); setError('')
    }, 0)
    return () => clearTimeout(timer)
  }, [path, completedId])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const load = async () => {
      if (suppliedRegion || pending) return
      pending = true
      try { const value = await loadReportConfig(controller.signal); if (!controller.signal.aborted) { setConfig(value); setConfigError('') } }
      catch (failure) { if (!controller.signal.aborted) setConfigError(errorMessage(failure)) }
      finally { pending = false }
    }
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [suppliedRegion, reload])
  useEffect(() => { const requests = analysisRequest.current; return () => requests.cancel() }, [])
  function changed(updated: PrivateReportDTO) { currentSavedReport.current = updated.id; savedRequest.current.cancel(); setReport(updated); setSavedCheck({key: savedReportKey(updated.id, path, reportUpdateKey, reload), status: 'current'}); onChanged?.() }
  function complete(updated: PrivateReportDTO) {
    savedRequest.current.cancel(); setReport(updated); setSavedCheck({key: savedReportKey(updated.id, `/report/success/${encodeURIComponent(updated.id)}`, reportUpdateKey, reload), status: 'current'}); setCompletedId(updated.id); navigate(`/report/success/${encodeURIComponent(updated.id)}`)
  }
  async function analyze(photo: UploadDTO | null = draft.photo) {
    if (!photo) return
    const task = analysisRequest.current.begin()
    setAnalyzing(true); setError('')
    try {
      const analysis = await analyzePhoto(photo.photoId, createIdempotencyKey(), task.signal)
      if (task.current()) dispatch({ type: 'analysis', analysis })
    } catch (failure) { if (task.current()) setError(`${errorMessage(failure)} Your photo is retained. Continue manually; an accepted analysis may still finish in the background.`) }
    finally { if (task.current()) setAnalyzing(false) }
  }
  function continuePhoto(consent: boolean, uploadedPhoto?: UploadDTO, previewUrl?: string) {
    const photo = uploadedPhoto ?? draft.photo
    if (!photo || saving || report) return
    if (uploadedPhoto) {
      currentPhoto.current = uploadedPhoto.photoId
      dispatch({ type: 'photo', photo: uploadedPhoto })
      if (previewUrl !== undefined) setPhotoUrl(previewUrl)
    }
    navigate('/report/confirm')
    if (consent) void analyze(photo)
    else { analysisRequest.current.cancel(); setAnalyzing(false); dispatch({ type: 'manual' }) }
  }
  function restart() {
    analysisRequest.current.cancel(); currentPhoto.current = null; currentSavedReport.current = null; photoDraftStarted.current = false; dispatch({ type: 'reset' }); setReport(null)
    setCompletedId(null); setPhotoUrl(''); setPhotoEpoch((value) => value + 1); setError(''); navigate('/report')
  }
  return <div className={`report-flow report-wizard report-step-${step}`} data-report-step={step}>
    <ol className="report-progress" aria-label="Report progress">{(['photo', 'confirm', 'success'] as const).map((value, index) => <li key={value} aria-current={step === value ? 'step' : undefined} className={step === value ? 'current' : ''}><span aria-hidden="true">{index + 1}</span>{['Photo', 'AI Scan', 'Submitted'][index]}</li>)}</ol>
    {region?.isDemo && <p className="report-note report-demo-note">Demonstration region · not a surveyed campus result.</p>}
    {step === 'confirm' && !draft.photo && !report && <section className="report-context-guard"><h2>Start with a photo</h2><p>This page has no photo draft in this browser. Choose and upload a private photo before reviewing the report.</p><button type="button" onClick={() => navigate('/report')}>Add a photo</button></section>}
    {step === 'success' && !validSuccess && <section className="report-context-guard"><h2>No completed submission</h2><p>A URL cannot confirm a report. Start a new report or open your saved records.</p><button type="button" onClick={() => navigate('/report')}>Start a report</button><button type="button" className="report-secondary" onClick={() => navigate('/my-reports')}>My Reports</button></section>}
    <div hidden={step !== 'photo' || !!report}>
      <PhotoUpload key={photoEpoch} flowMode="steps" disabled={saving} onContinue={continuePhoto} onPhotoSelected={() => {
        resumeRequest.current.cancel(); photoDraftStarted.current = true
        analysisRequest.current.cancel(); currentPhoto.current = null; setAnalyzing(false); dispatch({ type: 'photo', photo: null }); setPhotoUrl(''); setError('')
      }} onPhotoUploaded={(photo, url) => {
        resumeRequest.current.cancel(); photoDraftStarted.current = true
        currentPhoto.current = photo.photoId; dispatch({ type: 'photo', photo }); setPhotoUrl(url); setError('')
      }} />
      <button className="report-cancel" type="button" onClick={() => navigate(returnTo)}>Cancel &amp; Return {returnTo.startsWith('/my-reports') ? 'to My Reports' : 'to Route'}</button>
    </div>
    {step === 'photo' && report && <section><h2>Your report is already saved</h2><p>Continue reviewing its personal avoidance or start another report after completing this one.</p><button type="button" onClick={() => navigate(completedId ? `/report/success/${encodeURIComponent(report.id)}` : '/report/confirm')}>Continue saved report</button></section>}
    {draft.photo && <div hidden={step !== 'confirm'} className="report-confirm-content">
      {!report && <>
        <div className={`report-scan-banner ${analyzing ? 'is-loading' : ''}`} role="status"><span aria-hidden="true">✦</span><h2>{analyzing ? 'Analyzing your photo…' : draft.analysis?.aiStatus === 'completed' ? 'AI Scan Complete' : draft.analysis?.aiStatus === 'uncertain' ? 'AI needs your review' : 'Your observation matters'}</h2></div>
        {photoUrl && <div className="report-analysis-photo"><img src={photoUrl} alt="Your private photo being reviewed" /><span>{analyzing ? 'External analysis in progress' : 'Private evidence · measurements unknown'}</span></div>}
        <AIAnalysisFeedback analysis={draft.analysis} isLoading={analyzing} onApplyFindings={() => dispatch({ type: 'apply_analysis' })} onManualFallback={() => { analysisRequest.current.cancel(); setAnalyzing(false); setError(''); dispatch({ type: 'manual' }) }} />
        <p className="report-note">{draft.analysisId ? 'The saved AI record will be attached. Your facts remain editable.' : 'Manual report: no analysis is attached.'} AI does not measure passage width or slope.</p>
        {draft.analysis?.aiStatus === 'unavailable' && <button type="button" className="report-secondary" disabled={analyzing} onClick={() => void analyze()}>I choose to retry external AI analysis</button>}
        <ReportForm key={draft.photo.photoId} photoId={draft.photo.photoId} analysisId={draft.analysisId} category={draft.category} description={draft.description}
          disabled={analyzing} onSavingChange={setSaving} onFactsChange={(category, description) => dispatch({ type: 'facts', category, description })}
          region={region} passages={passages} route={route} onReportCreated={(created) => {
            if (created.photoId === currentPhoto.current) changed(created)
            else { onChanged?.(); setError(`A report for the previous photo was saved as ${created.id}. Your new photo draft is unchanged; find the earlier report in My Reports.`) }
          }} />
        <button className="report-secondary report-primary-wide" type="button" disabled={saving} onClick={() => navigate('/report')}>Edit Photo / Rescan</button>
      </>}
      {report && <>
        <section className="report-saved-review"><h2>Review your personal detour</h2><p>Report <strong>{report.id}</strong> is saved. It has not been sent to campus facilities or publicly verified.</p><p>Review the server preview and explicitly confirm personal avoidance, or submit the saved report without it.</p><button className="report-secondary" type="button" onClick={() => navigate(`/my-reports/${encodeURIComponent(report.id)}`)}>Edit saved report facts</button></section>
        {region && <AvoidanceDrawer disabled={savedStatus !== 'current'} report={report} region={region} passages={passages} route={route} onBusyChange={setSaving} onUpdated={(updated) => { if (currentSavedReport.current !== updated.id) { onChanged?.(); return } changed(updated); if (isPersonalEffective(updated, Date.now())) complete(updated) }} />}
        <button type="button" className="report-secondary report-primary-wide" disabled={savedStatus !== 'current' || saving} onClick={() => complete(report)}>Submit without personal avoidance</button>
      </>}
    </div>}
    {step === 'success' && validSuccess && report && <div className="report-success-content">
      <div className="report-success-mark" aria-hidden="true">✓</div><h2>Successfully Reported!</h2><p>Report <strong>#{report.id}</strong></p>
      <p className="report-success-scope">{savedStatus !== 'current' ? 'Current avoidance status is being checked. Do not rely on the earlier detour status.' : isPersonalEffective(report, now) ? `Personal detour for this browser session until ${new Date(report.personalAvoidance!.validUntil).toLocaleString('en-AU',{dateStyle:'short',timeStyle:'short',timeZone:region?.timezone??'Australia/Sydney'})} (${region?.timezone??'Australia/Sydney'}).` : 'Report saved. Personal avoidance is not enabled.'}</p>
      <p className="report-note">{savedStatus === 'current' ? `Public activity: ${report.publicActivity}.` : 'Current public activity is unverified.'} Your photo stays private.</p>
      <button type="button" className="report-primary-wide" onClick={() => navigate('/route')}>Return to Route <span aria-hidden="true">→</span></button>
      <div className="report-actions"><button className="report-secondary" type="button" onClick={() => navigate(`/my-reports/${encodeURIComponent(report.id)}`)}>View report</button><button className="report-secondary" type="button" disabled={saving} onClick={restart}>Report another barrier</button></div>
      {!onNavigate && <Link className="report-link" href="/my-reports">My Reports</Link>}
    </div>}
    {savedId && savedStatus !== 'current' && <p role="status">{savedStatus === 'checking' ? 'Checking the latest saved report…' : 'Current report status could not be verified.'} <button type="button" className="report-secondary" onClick={() => setReload(value => value + 1)}>Reload saved report</button></p>}
    {(error || (!suppliedRegion && configError)) && <p className="report-error" role="alert">{error || configError} <button type="button" className="report-secondary" onClick={() => { setError(''); setReload((value) => value + 1) }}>Reload configuration</button></p>}
    <p className="report-note report-privacy-note">Your reports belong to this anonymous browser session. Closing the browser may lose access to this identity.</p>
  </div>
}
