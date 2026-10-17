'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useId, useMemo, useRef, useState } from 'react'

import { MapView } from '@/components/map/MapView'
import { ApiError, createIdempotencyKey, errorMessage, request } from '@/shared/client/api'
import { PositionSchema } from '@/shared/contracts/common'
import { AvoidGeometrySchema, type AvoidGeometry } from '@/shared/contracts/geo'
import { PrivateReportDTOSchema, ReportCategorySchema, type PrivateReportDTO } from '@/shared/contracts/hazards'
import { UploadDTOSchema } from '@/shared/contracts/photos'
import type { RegionDTO } from '@/shared/contracts/region'
import { ExtraEvidenceSchema, ReviewInputSchema, type ReviewInput } from '@/shared/contracts/review'

import './admin.css'

export type AdminHazardReviewProps = {
  report: PrivateReportDTO
  region: RegionDTO
  suggestedGeometry: AvoidGeometry | null
}
type Action = ReviewInput['action']
const actions: Action[] = ['verify', 'correct', 'reject', 'resolve', 'reopen']
const allowed: Record<PrivateReportDTO['status'], Action[]> = {
  pending: ['verify', 'correct', 'reject'], ai_assessed: ['verify', 'correct', 'reject'],
  verified: ['verify', 'correct', 'reject', 'resolve'], resolved: ['correct', 'reopen'], rejected: ['correct', 'reopen'],
}
function json(value: string): unknown {
  try { return JSON.parse(value) }
  catch { throw new Error('Enter valid JSON for the coordinates or public geometry.') }
}
function instant(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error('Provide the actual observation time.')
  return new Date(timestamp).toISOString()
}
function deviceLocalTime(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
function message(error: unknown): string {
  return error instanceof ApiError
    ? `${error.code}: ${error.message}${error.requestId ? ` Request ID: ${error.requestId}` : ''}`
    : errorMessage(error)
}

// Adapted from B's adc42779 administrative review layout; all commands use real, validated business APIs.
export function AdminHazardReview({ report, region, suggestedGeometry }: AdminHazardReviewProps) {
  const router = useRouter()
  const id = useId()
  const [current, setCurrent] = useState(report)
  const [action, setAction] = useState<Action>(report.status === 'resolved' || report.status === 'rejected' ? 'reopen' : 'verify')
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState(report.category)
  const [description, setDescription] = useState(report.description)
  const [location, setLocation] = useState(JSON.stringify(report.location))
  const [observedAt, setObservedAt] = useState(report.observedAt)
  const [evidenceKind, setEvidenceKind] = useState<'field_observation' | 'trusted_maintainer'>('field_observation')
  const [evidenceTime, setEvidenceTime] = useState('')
  const [evidenceSummary, setEvidenceSummary] = useState('')
  const [sourceReference, setSourceReference] = useState('')
  const [evidencePhotoId, setEvidencePhotoId] = useState('')
  const [evidenceConfirmed, setEvidenceConfirmed] = useState(false)
  const [geometry, setGeometry] = useState(report.publicAvoidGeometry ? JSON.stringify(report.publicAvoidGeometry, null, 2) : '')
  const [validUntil, setValidUntil] = useState('')
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [photoFailed, setPhotoFailed] = useState(false)
  const command = useRef<{ body: string; key: string } | null>(null)
  const uploadKey = useRef<{ file: File; key: string } | null>(null)
  const needsEvidence = action === 'verify' || action === 'resolve' || (action === 'correct' && current.status === 'verified')
  const editsPublicGeometry = action === 'verify' || (action === 'correct' && current.status === 'verified')
  const preview = useMemo(() => {
    try { const parsed = AvoidGeometrySchema.safeParse(JSON.parse(geometry)); return parsed.success ? parsed.data : null }
    catch { return null }
  }, [geometry])
  const draftLocation = useMemo(() => {
    try { const parsed = PositionSchema.safeParse(JSON.parse(location)); return parsed.success ? parsed.data : current.location }
    catch { return current.location }
  }, [location, current.location])
  const disabled = pending || uploading

  function loadReport(updated: PrivateReportDTO) {
    setCurrent(updated)
    setCategory(updated.category)
    setDescription(updated.description)
    setLocation(JSON.stringify(updated.location))
    setObservedAt(updated.observedAt)
    setGeometry(updated.publicAvoidGeometry ? JSON.stringify(updated.publicAvoidGeometry, null, 2) : '')
    setReason('')
    setEvidenceConfirmed(false)
    setEvidenceTime('')
    setEvidenceSummary('')
    setSourceReference('')
    setEvidencePhotoId('')
    setEvidenceFile(null)
    setValidUntil('')
    setAction(updated.status === 'resolved' || updated.status === 'rejected' ? 'reopen' : 'correct')
  }

  async function uploadEvidence() {
    if (!evidenceFile) return
    setUploading(true); setError(''); setSuccess('')
    try {
      if (evidenceFile.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(evidenceFile.type)) {
        throw new Error('Select a JPEG or PNG image up to 5 MiB.')
      }
      if (uploadKey.current?.file !== evidenceFile) uploadKey.current = { file: evidenceFile, key: createIdempotencyKey() }
      const form = new FormData()
      form.append('file', evidenceFile)
      form.append('purpose', 'review_evidence')
      const uploaded = await request('/api/uploads', UploadDTOSchema, {
        method: 'POST', headers: { 'Idempotency-Key': uploadKey.current.key }, body: form,
      })
      if (uploaded.purpose !== 'review_evidence') throw new Error('The upload did not return an administrator evidence photo.')
      setEvidencePhotoId(uploaded.photoId)
      setSuccess('Independent evidence photo uploaded. It is private and has not published this report.')
    } catch (failure) { setError(message(failure)) }
    finally { setUploading(false) }
  }

  async function submit() {
    setPending(true); setError(''); setSuccess('')
    try {
      if (!allowed[current.status].includes(action)) throw new Error('This action is unavailable for the current report status.')
      if (needsEvidence && !evidenceConfirmed) throw new Error('Confirm that you independently checked the evidence before submitting.')
      const evidence = needsEvidence ? ExtraEvidenceSchema.parse(evidenceKind === 'field_observation' ? {
        kind: evidenceKind, observedAt: instant(evidenceTime), summary: evidenceSummary,
        ...(evidencePhotoId.trim() ? { photoId: evidencePhotoId.trim() } : {}),
      } : { kind: evidenceKind, observedAt: instant(evidenceTime), summary: evidenceSummary, sourceReference }) : undefined
      const base = { expectedVersion: current.rowVersion, reason }
      let input: unknown
      if (action === 'verify') {
        input = { ...base, action, extraEvidence: evidence, publicAvoidGeometry: json(geometry), ...(validUntil ? { validUntil: instant(validUntil) } : {}) }
      } else if (action === 'correct') {
        const point = PositionSchema.parse(json(location))
        const time = instant(observedAt)
        const corrections = {
          ...(category !== current.category ? { category } : {}),
          ...(description.trim() !== current.description ? { description } : {}),
          ...(JSON.stringify(point) !== JSON.stringify(current.location) ? { location: point } : {}),
          ...(time !== current.observedAt ? { observedAt: time } : {}),
        }
        const publicGeometry = editsPublicGeometry && geometry.trim() ? AvoidGeometrySchema.parse(json(geometry)) : null
        const geometryChanged = publicGeometry && JSON.stringify(publicGeometry) !== JSON.stringify(current.publicAvoidGeometry)
        input = { ...base, action,
          ...(Object.keys(corrections).length ? { corrections } : {}),
          ...(needsEvidence ? { extraEvidence: evidence } : {}),
          ...(geometryChanged ? { publicAvoidGeometry: publicGeometry } : {}),
          ...(editsPublicGeometry && validUntil ? { validUntil: instant(validUntil) } : {}),
        }
        if (!Object.keys(corrections).length && !geometryChanged && !(editsPublicGeometry && validUntil)) throw new Error('Change at least one fact, public geometry or validity field.')
      } else if (action === 'resolve') input = { ...base, action, extraEvidence: evidence }
      else input = { ...base, action }
      const validated = ReviewInputSchema.safeParse(input)
      if (!validated.success) throw new Error(validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' '))
      const body = JSON.stringify(validated.data)
      if (command.current?.body !== body) command.current = { body, key: createIdempotencyKey() }
      const updated = await request(`/api/reports/${encodeURIComponent(current.id)}/review`, PrivateReportDTOSchema, {
        method: 'PATCH', body, headers: { 'Idempotency-Key': command.current.key },
      })
      loadReport(updated)
      setSuccess(`Review saved. Status: ${updated.status}; report version: ${updated.rowVersion}.`)
      router.refresh()
    } catch (failure) { setError(message(failure)) }
    finally { setPending(false) }
  }

  return <section className="accessloop-admin" aria-label="Report review">
    <div className="al-admin-card">
      <div className="al-admin-heading"><div><h2>Review report</h2><p>{current.id}</p></div><span className="al-admin-badge">{current.status} · v{current.rowVersion}</span></div>
      {current.isDemo && <p role="note">Demonstration record. Synthetic workflow checks do not represent a physical campus observation.</p>}
      <p>Public activity: <strong>{current.publicActivity}</strong>. Personal avoidance: <strong>{current.personalAvoidance?.effective ? 'effective' : 'not effective'}</strong>.</p>
      <div className="al-admin-grid">
        <div><h3>Private report photo</h3>{photoFailed ? <p role="alert">The authorized photo could not be loaded.</p> : <Image
          className="al-admin-photo" src={`/api/photos/${encodeURIComponent(current.photoId)}`} alt="Original report evidence; access restricted to its author and administrators"
          width={1200} height={900} unoptimized onError={() => setPhotoFailed(true)}
        />}</div>
        <div><h3>Location and public geometry draft</h3><div onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest('button')) event.preventDefault()
        }}><MapView bbox={region.bbox} location={action === 'correct' ? draftLocation : current.location} preview={preview} now={Date.parse(current.updatedAt)} /></div>
          <p className="al-admin-note">Coordinate map without a street basemap. Draft geometry is not published until a validated review succeeds.</p></div>
      </div>
      <div className="al-admin-grid al-admin-comparison">
        <div><h3>Original AI record · read only</h3><p>{current.analysis ? `${current.analysis.aiStatus} · ${current.analysis.model}` : 'No AI assessment attached.'}</p>
          {current.analysis?.unavailableReason && <p>{current.analysis.unavailableReason}</p>}
          {current.analysis?.result && <pre>{JSON.stringify(current.analysis.result, null, 2)}</pre>}
        </div>
        <div><h3>Current report facts</h3><dl><dt>Category</dt><dd>{current.category}</dd><dt>Location</dt><dd>{current.location.join(', ')}</dd>
          <dt>Observed at</dt><dd>{current.observedAt}</dd><dt>Description</dt><dd>{current.description}</dd></dl></div>
      </div>
    </div>

    <div className="al-admin-card">
      <h3>Administrative action</h3>
      <fieldset disabled={disabled}>
        <div className="al-admin-actions">{actions.map((value) => <button type="button" key={value} aria-pressed={action === value}
          disabled={!allowed[current.status].includes(value)} className={action === value ? 'al-admin-primary' : ''}
          onClick={() => { setAction(value); setEvidenceConfirmed(false); setError(''); setSuccess('') }}>{value === 'verify' && current.status === 'verified' ? 'Reverify' : value}</button>)}</div>
        <label htmlFor={`${id}-reason`}>Reason · required<textarea id={`${id}-reason`} value={reason} maxLength={1000} rows={2} onChange={(event) => setReason(event.target.value)} /></label>
        {action === 'correct' && <div className="al-admin-grid">
          <label htmlFor={`${id}-category`}>Corrected category<select id={`${id}-category`} value={category} onChange={(event) => {
            const selected = ReportCategorySchema.safeParse(event.target.value); if (selected.success) setCategory(selected.data)
            setEvidenceConfirmed(false)
          }}>{ReportCategorySchema.options.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label htmlFor={`${id}-location`}>Corrected location [longitude, latitude]<input id={`${id}-location`} value={location} onChange={(event) => { setLocation(event.target.value); setEvidenceConfirmed(false) }} /></label>
          <label htmlFor={`${id}-observed`}>Report observation time · ISO 8601<input id={`${id}-observed`} value={observedAt} onChange={(event) => { setObservedAt(event.target.value); setEvidenceConfirmed(false) }} /></label>
          <label htmlFor={`${id}-description`}>Corrected description<textarea id={`${id}-description`} value={description} maxLength={1000} onChange={(event) => { setDescription(event.target.value); setEvidenceConfirmed(false) }} /></label>
        </div>}
        {needsEvidence && <fieldset className="al-admin-subsection"><legend>Independent verification evidence</legend>
          <label htmlFor={`${id}-kind`}>Evidence source<select id={`${id}-kind`} value={evidenceKind} onChange={(event) => {
            if (event.target.value === 'field_observation' || event.target.value === 'trusted_maintainer') setEvidenceKind(event.target.value)
            setEvidenceConfirmed(false)
          }}><option value="field_observation">Independent field observation</option><option value="trusted_maintainer">Trusted maintainer record</option></select></label>
          <label htmlFor={`${id}-evidence-time`}>Actually observed at · your device time<input id={`${id}-evidence-time`} type="datetime-local" value={evidenceTime} onChange={(event) => { setEvidenceTime(event.target.value); setEvidenceConfirmed(false) }} /></label>
          <button type="button" onClick={() => { setEvidenceTime(deviceLocalTime()); setEvidenceConfirmed(false) }}>Observed now · use device time</button>
          <label htmlFor={`${id}-summary`}>Independent evidence summary · required<textarea id={`${id}-summary`} rows={2} maxLength={1000} value={evidenceSummary} onChange={(event) => { setEvidenceSummary(event.target.value); setEvidenceConfirmed(false) }} /></label>
          {evidenceKind === 'trusted_maintainer' ? <label htmlFor={`${id}-reference`}>Trusted source record ID or HTTPS reference · required<input id={`${id}-reference`} maxLength={500} value={sourceReference} onChange={(event) => { setSourceReference(event.target.value); setEvidenceConfirmed(false) }} /></label> : <>
            <label htmlFor={`${id}-file`}>Optional independent evidence photo · JPEG/PNG, up to 5 MiB<input id={`${id}-file`} type="file" accept="image/jpeg,image/png" onChange={(event) => {
              setEvidenceFile(event.target.files?.[0] ?? null); setEvidencePhotoId(''); setEvidenceConfirmed(false)
            }} /></label>
            <button type="button" disabled={!evidenceFile} onClick={() => void uploadEvidence()}>Upload independent evidence photo</button>
            <label htmlFor={`${id}-evidence-photo`}>Private review evidence photo ID · optional<input id={`${id}-evidence-photo`} value={evidencePhotoId} onChange={(event) => { setEvidencePhotoId(event.target.value); setEvidenceConfirmed(false) }} /></label>
          </>}
          <label className="al-admin-check"><input type="checkbox" checked={evidenceConfirmed} onChange={(event) => setEvidenceConfirmed(event.target.checked)} />I independently checked this evidence. The original report, its photo and AI output are not my independent verification.</label>
        </fieldset>}
        {editsPublicGeometry && <fieldset className="al-admin-subsection"><legend>Public avoidance area</legend>
          {suggestedGeometry && <button type="button" onClick={() => { setGeometry(JSON.stringify(suggestedGeometry, null, 2)); setEvidenceConfirmed(false) }}>Use passage buffer proposal</button>}
          <p className="al-admin-note">Check the proposal against independent evidence. Selecting it does not verify or publish the report.</p>
          <label htmlFor={`${id}-geometry`}>Public Polygon or MultiPolygon · GeoJSON<textarea id={`${id}-geometry`} className="al-admin-code" rows={6} value={geometry} onChange={(event) => { setGeometry(event.target.value); setEvidenceConfirmed(false) }} /></label>
          {geometry.trim() && !preview && <p role="alert">The geometry must be valid Polygon or MultiPolygon GeoJSON.</p>}
          <label htmlFor={`${id}-until`}>Optional valid-until override · your device time<input id={`${id}-until`} type="datetime-local" value={validUntil} onChange={(event) => { setValidUntil(event.target.value); setEvidenceConfirmed(false) }} /></label>
          <p className="al-admin-note">Leave blank to use the service rule. Validity is limited by the evidence observation time and the region policy.</p>
        </fieldset>}
        {action === 'reopen' && <p className="al-admin-note">Reopening returns the report to pending. Previous personal confirmations and public activity remain disabled.</p>}
        {action === 'reject' && <p className="al-admin-note">Rejection stops this report’s public and personal avoidance. Its history is retained.</p>}
        {action === 'resolve' && <p className="al-admin-note">Resolution requires independent evidence that the verified obstruction has been cleared. Expiry alone is not resolution.</p>}
        <button type="button" className="al-admin-primary" disabled={!reason.trim() || (needsEvidence && !evidenceConfirmed)} onClick={() => void submit()}>{pending ? 'Saving review…' : `Confirm ${action}`}</button>
        <button type="button" onClick={async () => {
          setPending(true); setError(''); setSuccess('')
          try { loadReport(await request(`/api/reports/${encodeURIComponent(current.id)}`, PrivateReportDTOSchema)); router.refresh() }
          catch (failure) { setError(message(failure)) }
          finally { setPending(false) }
        }}>Reload latest report · discard this draft</button>
      </fieldset>
      {uploading && <p role="status">Uploading private evidence…</p>}
      {error && <p className="al-admin-error" role="alert">{error} Your inputs are retained.</p>}
      {success && <p className="al-admin-success" role="status">{success}</p>}
    </div>
  </section>
}
