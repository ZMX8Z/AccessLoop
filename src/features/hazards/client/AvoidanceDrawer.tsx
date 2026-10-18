'use client'
import React, { useEffect, useRef, useState } from 'react'
import { PassagePicker } from '@/components/map/PassagePicker'
import { ApiError, createIdempotencyKey, errorMessage, LatestRequest } from '@/shared/client/api'
import type { PrivateReportDTO, PreviewDTO } from '@/shared/contracts/hazards'
import type { RegionDTO, PresetPassageDTO } from '@/shared/contracts/region'
import type { PassageRef, RouteDTO } from '@/shared/contracts'
import { confirmAvoidance, deleteAvoidance, fetchReport, previewAvoidance } from './api'
import { confirmationInput, isPersonalEffective } from './report-state'
import { localTime } from './ReportForm'

interface Props {
  report: PrivateReportDTO; region: RegionDTO; passages: PresetPassageDTO[]; route?: RouteDTO | null
  onUpdated: (report: PrivateReportDTO) => void
}
export function AvoidanceDrawer({ report, region, passages, route = null, onUpdated }: Props) {
  const [now, setNow] = useState(0)
  const [reviewing, setReviewing] = useState(!report.personalAvoidance?.effective)
  const [observedAt, setObservedAt] = useState(localTime(report.personalAvoidance?.observedAt ?? report.observedAt))
  const [passage, setPassage] = useState<PassageRef | null>(report.personalAvoidance?.passage ?? report.passage)
  const [preview, setPreview] = useState<PreviewDTO | null>(null)
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [refresh, setRefresh] = useState(0)
  const latest = useRef(new LatestRequest())
  const confirmOperation = useRef<{ body: string; key: string } | null>(null)
  const stopOperation = useRef<{ version: number; key: string } | null>(null)
  const observation = observedAt && Number.isFinite(Date.parse(observedAt)) ? new Date(observedAt).toISOString() : null
  const possible = report.status !== 'resolved' && report.status !== 'rejected'
  const effective = isPersonalEffective(report, now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    const requests = latest.current, task = requests.begin()
    if (!reviewing || !possible || !passage || !observation) return () => requests.cancel()
    const timer = setTimeout(async () => {
      setPreview(null); setConsent(false); setLoading(true)
      try {
        if (Date.parse(observation) > Date.now()) throw new Error('Observation time cannot be in the future.')
        const result = await previewAvoidance(report.id, { expectedVersion: report.rowVersion, observedAt: observation, passage }, task.signal)
        if (!task.current()) return
        if (result.expectedVersion !== report.rowVersion || result.configVersion !== region.configVersion
          || result.observedAt !== observation || JSON.stringify(result.passage) !== JSON.stringify(passage)) throw new Error('Conditions changed. Refresh configuration and review a new preview.')
        setPreview(result)
      } catch (failure) { if (task.current()) setError(errorMessage(failure)) }
      finally { if (task.current()) setLoading(false) }
    }, 200)
    return () => { clearTimeout(timer); requests.cancel() }
  }, [reviewing, possible, report.id, report.rowVersion, observation, passage, region.configVersion, refresh])
  const validPreview = preview && Date.parse(preview.expiresAt) > now && Date.parse(preview.validUntil) > now
    && preview.expectedVersion === report.rowVersion && preview.configVersion === region.configVersion
    && preview.observedAt === observation && JSON.stringify(preview.passage) === JSON.stringify(passage)
  async function confirm() {
    setBusy(true); setError('')
    try {
      const input = confirmationInput(preview, consent, Date.now())
      const body = JSON.stringify(input)
      if (confirmOperation.current?.body !== body) confirmOperation.current = { body, key: createIdempotencyKey() }
      const updated = await confirmAvoidance(report.id, input, confirmOperation.current.key)
      setReviewing(false); setConsent(false); setPreview(null); onUpdated(updated)
    } catch (failure) {
      setError(failure instanceof ApiError ? `${failure.code}: ${failure.message}` : errorMessage(failure))
      if (failure instanceof ApiError && ['VERSION_CONFLICT', 'PREVIEW_STALE'].includes(failure.code)) {
        setPreview(null); setConsent(false)
        if (failure.code === 'VERSION_CONFLICT') {
          try { const current = await fetchReport(report.id); if ('rowVersion' in current) onUpdated(current) }
          catch { /* Preserve the original failure and the user's observation. */ }
        }
        setRefresh((value) => value + 1)
      }
    } finally { setBusy(false) }
  }
  async function deactivate() {
    setBusy(true); setError('')
    if (stopOperation.current?.version !== report.rowVersion) stopOperation.current = { version: report.rowVersion, key: createIdempotencyKey() }
    try {
      const updated = await deleteAvoidance(report.id, report.rowVersion, stopOperation.current.key)
      setReviewing(false); setPreview(null); setConsent(false); onUpdated(updated)
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <section aria-label="Personal avoidance"><h2>Personal temporary avoidance</h2>
    <p role="status"><strong>{effective ? "Effective for the report author's session" : report.personalAvoidance?.active ? 'Expired or confirmation no longer effective' : 'Not enabled'}</strong></p>
    <p>Personal avoidance affects your session only. Stopping it does not remove any verified public barrier. Expiry does not mean the passage is clear.</p>
    {report.personalAvoidance && <p className="report-note">Observed {report.personalAvoidance.observedAt}; confirmed {report.personalAvoidance.confirmedAt}; valid until {report.personalAvoidance.validUntil}. Source: {report.personalAvoidance.decisionSource === 'user_manual' ? 'your manual observation' : 'AI suggestion and your confirmation'}.</p>}
    {!possible && <p>This report is {report.status}; personal avoidance cannot be confirmed.</p>}
    <div className="report-actions">
      {report.personalAvoidance?.active && <button disabled={busy} type="button" onClick={() => void deactivate()}>Stop my personal avoidance</button>}
      {possible && !reviewing && <button type="button" disabled={busy} onClick={() => {
        setObservedAt(''); setReviewing(true); setConsent(false); setPreview(null); setError('')
      }}>Renew / confirm a new observation</button>}
    </div>
    {possible && reviewing && <fieldset disabled={busy}>
      <legend>Review this observation and the server-generated area</legend>
      <label>Actually observed at · your device time<input type="datetime-local" value={observedAt} onChange={(event) => { setObservedAt(event.target.value); setPreview(null); setConsent(false); setError('') }} /></label>
      <button type="button" className="report-secondary" onClick={() => { setObservedAt(localTime()); setPreview(null); setConsent(false); setError('') }}>Observed now · use device time</button>
      <p className="report-note">The report location is fixed here. To move it, save a correction to the report facts first.</p>
      <PassagePicker bbox={region.bbox} location={report.location} route={route} passages={passages} value={passage} preview={validPreview ? preview.avoidGeometry : null} now={now}
        onLocationChange={() => setError('Use Edit report facts to change and save the report location before previewing.')}
        onChange={(value) => { setPassage(value); setPreview(null); setConsent(false); setError('') }} />
      {loading && <p role="status">Calculating the server preview…</p>}
      {validPreview && <p>Personal avoidance would last until {preview.validUntil}. Review the shaded area before choosing to confirm.</p>}
      {preview && !validPreview && <p role="alert">This preview has expired. Refresh it and confirm the updated area.</p>}
      <button type="button" className="report-secondary" disabled={loading || !passage || !observedAt} onClick={() => { setConsent(false); setPreview(null); setRefresh((value) => value + 1) }}>Refresh preview</button>
      <label className="report-check"><input type="checkbox" disabled={!validPreview} checked={consent && !!validPreview} onChange={(event) => setConsent(event.target.checked)} />I confirm this location, observation time and passage, and explicitly choose to avoid the displayed area for my session.</label>
      <button type="button" disabled={!validPreview || !consent || loading} onClick={() => void confirm()}>{busy ? 'Confirming…' : 'Confirm personal avoidance'}</button>
    </fieldset>}
    {error && <p role="alert" className="report-error">{error} No successful change is claimed. Your selected time and passage are retained.</p>}
  </section>
}
