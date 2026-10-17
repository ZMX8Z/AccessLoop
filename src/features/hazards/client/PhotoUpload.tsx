'use client'
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef, useState } from 'react'
import type { UploadDTO } from '@/shared/contracts/photos'
import { createIdempotencyKey, errorMessage, LatestRequest } from '@/shared/client/api'
import { uploadPhoto } from './api'

interface PhotoUploadProps {
  onPhotoUploaded: (data: UploadDTO, localPreviewUrl: string, consent: boolean) => void
  onPhotoSelected?: () => void
  disabled?: boolean
}
export function PhotoUpload({ onPhotoUploaded, onPhotoSelected, disabled = false }: PhotoUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef<{ file: File; key: string } | null>(null)
  const latest = useRef(new LatestRequest())
  useEffect(() => { const requests = latest.current; return () => requests.cancel() }, [])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  async function upload() {
    if (!file) return
    const task = latest.current.begin()
    if (operation.current?.file !== file) operation.current = { file, key: createIdempotencyKey() }
    setBusy(true); setError('')
    try {
      const photo = await uploadPhoto(file, 'report', operation.current.key, task.signal)
      if (task.current()) onPhotoUploaded(photo, previewUrl, consent)
    } catch (failure) { if (task.current()) setError(errorMessage(failure)) }
    finally { if (task.current()) setBusy(false) }
  }
  return <section aria-label="Private photo upload"><h2>1. Add a private photo</h2>
    <p>Use a JPEG or PNG up to 5 MiB. Photos are available to you and authorized administrators.</p>
    <label>Choose or take a photo<input type="file" accept="image/jpeg,image/png" capture="environment" disabled={disabled} onChange={(event) => {
      latest.current.cancel(); setBusy(false); onPhotoSelected?.(); operation.current = null
      const selected = event.target.files?.[0] ?? null
      setFile(null); setPreviewUrl(''); setError(''); setConsent(false)
      if (!selected) return
      if (!['image/jpeg', 'image/png'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
        setError('Choose a JPEG or PNG image up to 5 MiB.'); return
      }
      setFile(selected); setPreviewUrl(URL.createObjectURL(selected))
    }} /></label>
    {previewUrl && <img src={previewUrl} alt="Selected obstacle photo" />}
    <label className="report-check"><input type="checkbox" checked={consent} disabled={busy || disabled} onChange={(event) => setConsent(event.target.checked)} />I choose to send this photo to the configured external visual AI service (GLM). This is optional and does not enable avoidance.</label>
    <button type="button" disabled={!file || busy || disabled} onClick={() => void upload()}>{busy ? 'Uploading…' : 'Upload photo'}</button>
    {error && <p className="report-error" role="alert">{error} The photo has not been saved. Retry uses the same upload operation.</p>}
  </section>
}
