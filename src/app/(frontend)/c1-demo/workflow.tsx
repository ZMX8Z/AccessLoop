'use client'

import { useState } from 'react'
import { z } from 'zod'

import { type AnalysisDTO } from '@/shared/contracts/vision'
import { UploadDTOSchema } from '@/shared/contracts/photos'
import { PrivateReportDTOSchema, PreviewDTOSchema, type PrivateReportDTO, type PreviewDTO } from '@/shared/contracts/hazards'
import type { RegionRecord, PresetPassageRecord } from '@/shared/contracts/storage'
import { analyzePhoto } from '@/features/hazards/client/api'
import { GeometryPreview } from '@/features/hazards/GeometryPreview'

async function api<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: BodyInit): Promise<T> {
  const headers = new Headers()
  if (method !== 'GET') headers.set('Idempotency-Key', crypto.randomUUID())
  if (typeof body === 'string') headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { method, headers, body, cache: 'no-store' })
  const raw: unknown = await response.json()
  if (!response.ok) {
    const failure = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).safeParse(raw)
    throw new Error(failure.success ? `${failure.data.error.code}: ${failure.data.error.message}` : 'The request failed.')
  }
  return z.object({ data: schema }).parse(raw).data
}

async function sampleImage(): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image generation is unavailable in this browser.')
  context.fillStyle = '#dfe6e3'
  context.fillRect(0, 0, 640, 480)
  context.fillStyle = '#9da9a3'
  context.fillRect(120, 60, 400, 420)
  context.fillStyle = '#df7c37'
  context.fillRect(100, 220, 440, 60)
  context.fillStyle = '#183d33'
  context.font = '22px sans-serif'
  context.fillText('Synthetic illustration for workflow testing', 100, 400)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not create the sample.')), 'image/jpeg', 0.85))
  return new File([blob], 'synthetic-example.jpg', { type: 'image/jpeg' })
}

export function C1Demo({ region, passages, initialObservation }: {
  region: RegionRecord; passages: PresetPassageRecord[]; initialObservation: string
}) {
  const [file, setFile] = useState<File | null>(null)
  const [photoId, setPhotoId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisDTO | null>(null)
  const [report, setReport] = useState<PrivateReportDTO | null>(null)
  const [preview, setPreview] = useState<PreviewDTO | null>(null)
  const [passageId, setPassageId] = useState(passages[0]?.id ?? '')
  const [description, setDescription] = useState('A temporary barrier was observed across this passage.')
  const [aiConsent, setAiConsent] = useState(false)
  const [avoidConsent, setAvoidConsent] = useState(false)
  const [notice, setNotice] = useState('Start by uploading a photo or the synthetic sample.')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const selected = passages.find((passage) => passage.id === passageId)

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setFailed(false)
    try { setNotice(await action()) }
    catch (error) { setFailed(true); setNotice(error instanceof Error ? error.message : 'The request failed.') }
    finally { setBusy(false) }
  }

  async function upload(image: File) {
    await api('/api/session', z.object({ ready: z.literal(true) }), 'POST', '{}')
    const form = new FormData()
    form.set('file', image)
    const result = await api('/api/uploads', UploadDTOSchema, 'POST', form)
    setPhotoId(result.photoId)
    setAnalysis(null)
    setReport(null)
    setPreview(null)
    setAvoidConsent(false)
    return 'Private upload saved. You can continue with a manual report.'
  }

  const makeReport = async () => {
    if (!photoId || !selected) throw new Error('Upload a photo and choose a passage first.')
    const result = await api('/api/reports', PrivateReportDTOSchema, 'POST', JSON.stringify({
      photoId, ...(analysis ? { analysisId: analysis.analysisId } : {}),
      location: selected.geometry.coordinates[0], category: 'obstruction', description,
      observedAt: initialObservation,
      passage: { presetPassageId: selected.id, passageVersion: selected.passageVersion },
    }))
    setReport(result)
    setPreview(null)
    return 'Report saved. Personal avoidance is still off.'
  }

  return <main className="c1-demo">
    <style>{`
      .c1-demo{max-width:820px;margin:32px auto;padding:0 20px 64px;color:#193c32;font-family:system-ui,sans-serif}
      .c1-demo h1{font-size:30px;margin-bottom:8px}.c1-demo p{line-height:1.55}.c1-demo .label{font-size:12px;letter-spacing:.1em;text-transform:uppercase}
      .c1-demo section{border:1px solid #cbd9d2;border-radius:16px;padding:22px;margin:18px 0;background:#fff}
      .c1-demo h2{font-size:19px;margin-top:0}.c1-demo label{display:block;margin:14px 0}.c1-demo select,.c1-demo textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #9caea4;border-radius:8px;font:inherit}
      .c1-demo textarea{min-height:86px}.c1-demo button,.c1-demo .link{border:0;border-radius:8px;padding:12px 16px;background:#195e46;color:#fff;font:inherit;cursor:pointer;margin:6px 8px 6px 0;display:inline-block;text-decoration:none}
      .c1-demo button:disabled{opacity:.45;cursor:default}.c1-demo input[type=checkbox]{margin-right:8px;width:18px;height:18px;vertical-align:middle}
      .c1-demo .notice{padding:16px;border-radius:10px;background:#e5f0ea;overflow-wrap:anywhere}.c1-demo .error{background:#fff0e9;color:#913f1e}
      .c1-demo .meta{font-size:14px;color:#476359;overflow-wrap:anywhere}.c1-demo pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#f3f6f4;padding:12px;border-radius:8px}
      .c1-demo .status{font-weight:700}.c1-demo :focus-visible{outline:3px solid #da863e;outline-offset:3px}
    `}</style>
    <p className="label">AccessLoop · C1 backend demo</p>
    <h1>Report → preview → confirm</h1>
    <p>{region.name}. {region.isDemo ? 'Synthetic demo data. This is not a surveyed campus route.' : 'Use only the configured coverage area.'}</p>
    <p>Previewing does not activate avoidance. Your explicit confirmation affects only this browser session.</p>
    <div role="status" aria-live="polite" className={`notice${failed ? ' error' : ''}`}>{busy ? 'Working…' : notice}</div>
    <section>
      <h2>1. Add a private photo</h2>
      <label>JPEG or PNG, up to 5 MiB <input aria-label="Photo file" type="file" accept="image/jpeg,image/png" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <button disabled={busy || !file} onClick={() => run(async () => {
        if (!file) throw new Error('Choose a photo first.')
        return upload(file)
      })}>Upload selected photo</button>
      <button disabled={busy} onClick={() => run(async () => upload(await sampleImage()))}>Upload synthetic sample</button>
      {photoId && <p><a href={`/api/photos/${encodeURIComponent(photoId)}`} target="_blank" rel="noreferrer">View your private image</a></p>}
      <label><input type="checkbox" checked={aiConsent} disabled={busy || !!report} onChange={(event) => setAiConsent(event.target.checked)} />I agree to send this photo to the configured external AI service.</label>
      <button disabled={busy || !photoId || !aiConsent || !!report} onClick={() => run(async () => {
        if (!photoId) throw new Error('Choose a photo first.')
        const result = await analyzePhoto(photoId, crypto.randomUUID())
        setAnalysis(result)
        return result.aiStatus === 'completed' ? 'An AI suggestion is available. Review the facts before saving.' : 'AI did not provide a completed obstacle assessment. Continue manually.'
      })}>Analyze photo · optional</button>
      {analysis && <p className="meta">AI status: {analysis.aiStatus}. {analysis.result?.description}</p>}
    </section>
    <section>
      <h2>2. Save the observed facts</h2>
      <label>Configured passage <select value={passageId} disabled={busy || !!report} onChange={(event) => setPassageId(event.target.value)}>{passages.map((passage) => <option key={passage.id} value={passage.id}>{passage.name}</option>)}</select></label>
      <label>Observation <textarea value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} /></label>
      <button disabled={busy || !photoId || !selected || !!report} onClick={() => run(makeReport)}>Save manual report</button>
      <button disabled={busy || !report} onClick={() => run(async () => {
        if (!report) throw new Error('Save a report first.')
        const result = await api(`/api/reports/${report.id}`, PrivateReportDTOSchema, 'PATCH', JSON.stringify({ expectedVersion: report.rowVersion, description }))
        setReport(result)
        setPreview(null)
        setAvoidConsent(false)
        return 'Description updated. A new preview is required for another confirmation.'
      })}>Save description change</button>
      {report && <p className="meta">Report {report.id} · version {report.rowVersion} · {report.status}</p>}
    </section>
    <section>
      <h2>3. Review and explicitly confirm</h2>
      <button disabled={busy || !report || !selected} onClick={() => run(async () => {
        if (!report || !selected) throw new Error('Save a report first.')
        const result = await api(`/api/reports/${report.id}/avoidance-preview`, PreviewDTOSchema, 'POST', JSON.stringify({
          expectedVersion: report.rowVersion, observedAt: new Date().toISOString(),
          passage: { presetPassageId: selected.id, passageVersion: selected.passageVersion },
        }))
        setPreview(result)
        setAvoidConsent(false)
        return 'Preview ready. Nothing has been activated by this preview.'
      })}>Preview avoidance</button>
      {preview && <>
        <p>Applies to the selected passage until <time>{preview.validUntil}</time>.</p>
        <GeometryPreview geometry={preview.avoidGeometry} />
        <label><input type="checkbox" checked={avoidConsent} disabled={busy} onChange={(event) => setAvoidConsent(event.target.checked)} />I confirm this observation and want to avoid this passage in my session.</label>
        <button disabled={busy || !avoidConsent} onClick={() => run(async () => {
          if (!report) throw new Error('Save a report first.')
          const { expectedVersion, observedAt, passage, previewDigest } = preview
          const result = await api(`/api/reports/${report.id}/avoidance`, PrivateReportDTOSchema, 'POST', JSON.stringify({ expectedVersion, observedAt, passage, previewDigest, consent: true }))
          setReport(result)
          setPreview(null)
          setAvoidConsent(false)
          return 'Personal avoidance confirmed. It does not publish a public hazard.'
        })}>Confirm personal avoidance</button>
      </>}
      {report && <>
        <p className="status">Personal avoidance: {report.personalAvoidance?.effective ? 'effective' : 'off or expired'}</p>
        <button disabled={busy || !report.personalAvoidance?.active} onClick={() => run(async () => {
          const result = await api(`/api/reports/${report.id}/avoidance`, PrivateReportDTOSchema, 'DELETE', JSON.stringify({ expectedVersion: report.rowVersion }))
          setReport(result)
          setPreview(null)
          return 'Personal avoidance stopped. Public records are unchanged.'
        })}>Stop personal avoidance</button>
        <a className="link" href={`/api/reports/${report.id}/export`} target="_blank" rel="noreferrer">Open printable report</a>
      </>}
    </section>
    <p className="meta">Closing the browser may lose this anonymous identity. AI analysis and personal avoidance are separate choices. Expiry does not confirm that an obstacle has gone.</p>
  </main>
}
