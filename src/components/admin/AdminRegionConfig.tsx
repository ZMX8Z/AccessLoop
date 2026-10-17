'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'

import { ApiError, createIdempotencyKey, errorMessage, request } from '@/shared/client/api'
import { RegionAdminDTOSchema, RegionPatchInputSchema, type RegionAdminDTO } from '@/shared/contracts/admin-region'
import { BBoxSchema } from '@/shared/contracts/common'
import { LineStringSchema } from '@/shared/contracts/geo'
import type { PresetPassageDTO } from '@/shared/contracts/region'

import './admin.css'

type PassageDraft = { key: string; id?: string; name: string; coordinates: string }
function passageDrafts(passages: PresetPassageDTO[]): PassageDraft[] {
  return passages.map((passage) => ({ key: passage.id, id: passage.id, name: passage.name, coordinates: JSON.stringify(passage.geometry.coordinates, null, 2) }))
}
function coordinates(value: string): unknown {
  try { return JSON.parse(value) }
  catch { throw new Error('Each passage needs a valid JSON coordinate array: [[longitude, latitude], …].') }
}

// Retains B's region/status layout while replacing fixture fallbacks with the operator API.
export function AdminRegionConfig({ initialData }: { initialData: RegionAdminDTO }) {
  const router = useRouter()
  const id = useId()
  const [saved, setSaved] = useState(initialData)
  const [name, setName] = useState(initialData.region.name)
  const [timezone, setTimezone] = useState(initialData.region.timezone)
  const [bbox, setBbox] = useState(initialData.region.bbox.join(', '))
  const [buffer, setBuffer] = useState(String(initialData.region.avoidanceBufferM))
  const [isDemo, setIsDemo] = useState(initialData.region.isDemo)
  const [passages, setPassages] = useState(() => passageDrafts(initialData.presetPassages))
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const command = useRef<{ body: string; key: string } | null>(null)
  function apply(data: RegionAdminDTO) {
    setSaved(data); setName(data.region.name); setTimezone(data.region.timezone)
    setBbox(data.region.bbox.join(', ')); setBuffer(String(data.region.avoidanceBufferM)); setIsDemo(data.region.isDemo)
    setPassages(passageDrafts(data.presetPassages)); setReason('')
  }
  function updatePassage(key: string, change: Partial<Pick<PassageDraft, 'name' | 'coordinates'>>) {
    setPassages((current) => current.map((passage) => passage.key === key ? { ...passage, ...change } : passage))
  }
  async function save() {
    setPending(true); setError(''); setSuccess('')
    try {
      const parsedBBox = BBoxSchema.parse(bbox.split(',').map((value) => value.trim() ? Number(value) : NaN))
      const parsedPassages = passages.map((passage) => ({
        ...(passage.id ? { id: passage.id } : {}), name: passage.name,
        geometry: LineStringSchema.parse({ type: 'LineString', coordinates: coordinates(passage.coordinates) }),
      }))
      const originalPassages = saved.presetPassages.map((passage) => ({ id: passage.id, name: passage.name, geometry: passage.geometry }))
      const numericBuffer = buffer.trim() ? Number(buffer) : NaN
      const changes = {
        ...(name.trim() !== saved.region.name ? { name } : {}),
        ...(timezone !== saved.region.timezone ? { timezone } : {}),
        ...(JSON.stringify(parsedBBox) !== JSON.stringify(saved.region.bbox) ? { bbox: parsedBBox } : {}),
        ...(numericBuffer !== saved.region.avoidanceBufferM ? { avoidanceBufferM: numericBuffer } : {}),
        ...(isDemo !== saved.region.isDemo ? { isDemo } : {}),
        ...(JSON.stringify(parsedPassages) !== JSON.stringify(originalPassages) ? { presetPassages: parsedPassages } : {}),
      }
      const parsed = RegionPatchInputSchema.safeParse({ expectedVersion: saved.region.configVersion, reason, changes })
      if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' '))
      const body = JSON.stringify(parsed.data)
      if (command.current?.body !== body) command.current = { body, key: createIdempotencyKey() }
      const updated = await request('/api/admin/region', RegionAdminDTOSchema, {
        method: 'PATCH', headers: { 'Idempotency-Key': command.current.key }, body,
      })
      apply(updated)
      setSuccess(`Region saved at configuration version ${updated.region.configVersion}. Passage versions were assigned by the server.`)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof ApiError ? `${failure.code}: ${failure.message}${failure.requestId ? ` Request ID: ${failure.requestId}` : ''}` : errorMessage(failure))
    } finally { setPending(false) }
  }
  async function reload() {
    setPending(true); setError(''); setSuccess('')
    try { apply(await request('/api/admin/region', RegionAdminDTOSchema)); router.refresh() }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setPending(false) }
  }

  return <section className="accessloop-admin" aria-label="Region configuration"><div className="al-admin-card">
    <div className="al-admin-heading"><div><h2>Region and preset passages</h2><p>{saved.region.id}</p></div><span className="al-admin-badge">Config v{saved.region.configVersion} · hazards v{saved.region.hazardVersion}</span></div>
    <p>Operator changes are validated against active reports and confirmations. Draft edits do not change the live configuration.</p>
    <fieldset disabled={pending}>
      <div className="al-admin-grid">
        <label htmlFor={`${id}-name`}>Region name<input id={`${id}-name`} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label htmlFor={`${id}-timezone`}>IANA timezone<input id={`${id}-timezone`} value={timezone} placeholder="Australia/Sydney" onChange={(event) => setTimezone(event.target.value)} /></label>
        <label htmlFor={`${id}-bbox`}>Bounding box · west, south, east, north<input id={`${id}-bbox`} value={bbox} onChange={(event) => setBbox(event.target.value)} /></label>
        <label htmlFor={`${id}-buffer`}>Future passage buffer · 0.5–5 metres<input id={`${id}-buffer`} type="number" min="0.5" max="5" step="0.1" value={buffer} onChange={(event) => setBuffer(event.target.value)} /></label>
      </div>
      <label className="al-admin-check"><input type="checkbox" checked={isDemo} onChange={(event) => setIsDemo(event.target.checked)} />Mark the region and its returned passage data as a demonstration.</label>
      <fieldset className="al-admin-subsection"><legend>Complete preset passage list · {passages.length}</legend>
        <p className="al-admin-note">Existing IDs stay fixed. Saving a changed list replaces the full list, including removals; the server assigns IDs to new passages and versions to changes.</p>
        {passages.map((passage, index) => <div className="al-admin-passage" key={passage.key}>
          <div className="al-admin-heading"><strong>Passage {index + 1}</strong><button type="button" onClick={() => setPassages((current) => current.filter((item) => item.key !== passage.key))}>Remove from draft</button></div>
          <p className="al-admin-note">{passage.id ? `Existing ID: ${passage.id} · version ${saved.presetPassages.find((item) => item.id === passage.id)?.passageVersion ?? '—'}` : 'New passage · server assigns its ID when saved'}</p>
          <label htmlFor={`${id}-passage-name-${index}`}>Passage name<input id={`${id}-passage-name-${index}`} maxLength={120} value={passage.name} onChange={(event) => updatePassage(passage.key, { name: event.target.value })} /></label>
          <label htmlFor={`${id}-passage-points-${index}`}>LineString coordinates · JSON array of [longitude, latitude]<textarea id={`${id}-passage-points-${index}`} className="al-admin-code" rows={4} value={passage.coordinates} onChange={(event) => updatePassage(passage.key, { coordinates: event.target.value })} /></label>
        </div>)}
        <button type="button" onClick={() => setPassages((current) => [...current, { key: createIdempotencyKey(), name: '', coordinates: '' }])}>Add passage to draft</button>
      </fieldset>
      <label htmlFor={`${id}-reason`}>Operator reason · required<textarea id={`${id}-reason`} maxLength={1000} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="al-admin-actions"><button type="button" className="al-admin-primary" disabled={!reason.trim()} onClick={() => void save()}>{pending ? 'Saving…' : 'Save region configuration'}</button>
        <button type="button" onClick={() => void reload()}>Reload saved settings · discard draft</button></div>
    </fieldset>
    {error && <p className="al-admin-error" role="alert">{error} Your inputs are retained. On a version conflict, reload only when you are ready to discard the draft.</p>}
    {success && <p className="al-admin-success" role="status">{success}</p>}
  </div></section>
}
