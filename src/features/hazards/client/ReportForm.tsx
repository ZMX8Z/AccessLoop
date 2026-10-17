'use client'
import React, { useEffect, useRef, useState } from 'react'
import { PassagePicker } from '@/components/map/PassagePicker'
import { createIdempotencyKey, errorMessage, ApiError } from '@/shared/client/api'
import { CreateReportInputSchema, UpdateReportInputSchema, ReportCategorySchema, type PrivateReportDTO } from '@/shared/contracts/hazards'
import type { RegionDTO, PresetPassageDTO } from '@/shared/contracts/region'
import type { PassageRef, Position, RouteDTO } from '@/shared/contracts'
import { createReport, patchReport } from './api'
import type { ReportCategory } from './report-state'

export function localTime(value: string | number = Date.now()) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
interface ReportFormProps {
  photoId: string; analysisId?: string; category?: ReportCategory; description?: string
  onFactsChange?: (category: ReportCategory, description: string) => void
  region?: RegionDTO; passages?: PresetPassageDTO[]; route?: RouteDTO | null
  initialReport?: PrivateReportDTO
  onReportCreated: (report: PrivateReportDTO) => void
  onCancel?: () => void
  disabled?: boolean
}
export function ReportForm({ photoId, analysisId, category = 'obstruction', description = '', onFactsChange,
  region, passages = [], route = null, initialReport, onReportCreated, onCancel, disabled = false }: ReportFormProps) {
  const [now, setNow] = useState(0)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const [location, setLocation] = useState<Position | null>(initialReport?.location ?? null)
  const [passage, setPassage] = useState<PassageRef | null>(initialReport?.passage ?? null)
  const [observedAt, setObservedAt] = useState(initialReport ? localTime(initialReport.observedAt) : '')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const operation = useRef<{ body: string; key: string } | null>(null)
  async function save() {
    setError(''); setBusy(true)
    try {
      if (!region || !location || !passage || !observedAt) throw new Error('Choose a location, passage and actual observation time before saving.')
      const time = new Date(observedAt).toISOString()
      if (Date.parse(time) > Date.now()) throw new Error('Observation time cannot be in the future.')
      const facts = { photoId, ...(analysisId ? { analysisId } : {}), location, passage, category, description, observedAt: time }
      const input = initialReport
        ? UpdateReportInputSchema.parse({ ...facts, analysisId: analysisId ?? null, expectedVersion: initialReport.rowVersion })
        : CreateReportInputSchema.parse(facts)
      const body = JSON.stringify(input)
      if (operation.current?.body !== body) operation.current = { body, key: createIdempotencyKey() }
      const report = initialReport
        ? await patchReport(initialReport.id, UpdateReportInputSchema.parse(input), operation.current.key)
        : await createReport(CreateReportInputSchema.parse(input), operation.current.key)
      onReportCreated(report)
    } catch (failure) {
      setError(failure instanceof ApiError ? `${failure.code}: ${failure.message}${failure.requestId ? ` Reference: ${failure.requestId}` : ''}` : errorMessage(failure))
    } finally { setBusy(false) }
  }
  return <section aria-label="Report facts"><h2>{initialReport ? 'Edit observed facts' : '2. Confirm the observed facts'}</h2>
    <p>AI findings are suggestions. These fields record your own account. Saving a report does not enable avoidance.</p>
    <fieldset disabled={busy || disabled}>
      <label>Obstacle category<select value={category} onChange={(event) => {
        const value = ReportCategorySchema.safeParse(event.target.value)
        if (value.success) onFactsChange?.(value.data, description)
      }}>{ReportCategorySchema.options.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
      <label>Observation description<textarea value={description} maxLength={1000} onChange={(event) => onFactsChange?.(category, event.target.value)} /></label>
      <label>Actually observed at · your device time<input type="datetime-local" value={observedAt} onChange={(event) => setObservedAt(event.target.value)} required /></label>
      <button className="report-secondary" type="button" onClick={() => setObservedAt(localTime())}>Observed now · use device time</button>
      {region && <PassagePicker bbox={region.bbox} location={location} route={route} passages={passages} value={passage} preview={null}
        now={now} onLocationChange={(value) => { if (!busy) setLocation(value) }} onChange={(value) => { if (!busy) setPassage(value) }} />}
      {!region && <p>Waiting for the configured region and passages.</p>}
      <button type="button" disabled={!location || !passage || !observedAt || !description.trim() || !region} onClick={() => void save()}>{busy ? 'Saving…' : initialReport ? 'Save corrections' : 'Save report and review avoidance'}</button>
      {onCancel && <button className="report-secondary" type="button" onClick={onCancel}>Cancel editing</button>}
    </fieldset>
    {error && <p role="alert" className="report-error">{error} Your inputs are retained. On a version conflict, reload the report and review your changes before saving again.</p>}
  </section>
}
