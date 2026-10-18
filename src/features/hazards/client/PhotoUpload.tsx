'use client'
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef, useState } from 'react'
import type { UploadDTO } from '@/shared/contracts/photos'
import { createIdempotencyKey, errorMessage, LatestRequest } from '@/shared/client/api'
import { uploadPhoto } from './api'

interface PhotoUploadProps {
  onPhotoUploaded: (data: UploadDTO, localPreviewUrl: string, consent: boolean) => void
  onPhotoSelected?: () => void
  onContinue?: (consent: boolean, photo?: UploadDTO, previewUrl?: string) => void
  flowMode?: 'steps'
  disabled?: boolean
}
export function PhotoUpload({ onPhotoUploaded, onPhotoSelected, onContinue, flowMode, disabled = false }: PhotoUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [consent, setConsent] = useState(false)
  const [uploaded, setUploaded] = useState<UploadDTO | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null)
  const operation = useRef<{ file: File; key: string } | null>(null)
  const latest = useRef(new LatestRequest())
  useEffect(() => { const requests = latest.current; return () => requests.cancel() }, [])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  function select(selected: File | null) {
    latest.current.cancel(); setBusy(false); onPhotoSelected?.(); operation.current = null
    setFile(null); setPreviewUrl(''); setError(''); setConsent(false); setUploaded(null)
    if (!selected) return
    if (!['image/jpeg', 'image/png'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      setError('Choose a JPEG or PNG image up to 5 MiB.'); return
    }
    setFile(selected); setPreviewUrl(URL.createObjectURL(selected))
  }
  async function upload(continueWith?: boolean) {
    if (!file || busy || disabled || (continueWith === true && !consent)) return
    if (flowMode && uploaded && continueWith !== undefined) { onContinue?.(continueWith, uploaded, previewUrl); return }
    const task = latest.current.begin()
    if (operation.current?.file !== file) operation.current = { file, key: createIdempotencyKey() }
    setBusy(true); setError('')
    try {
      const photo = await uploadPhoto(file, 'report', operation.current.key, task.signal)
      if (task.current()) {
        setUploaded(photo); onPhotoUploaded(photo, previewUrl, flowMode ? false : consent)
        if (flowMode && continueWith !== undefined) onContinue?.(continueWith, photo, previewUrl)
      }
    } catch (failure) { if (task.current()) setError(errorMessage(failure)) }
    finally { if (task.current()) setBusy(false) }
  }
  return <section className="report-photo-upload" aria-label="Private photo upload">
    <h2>{flowMode ? 'Report a Route Barrier' : 'Add a private photo'}</h2>
    <p className="report-note">JPEG or PNG, up to 5 MiB. Your photo is private to you and authorized administrators.</p>
    <div className="photo-source-actions">
      <button type="button" className="photo-source photo-camera" disabled={disabled || busy} onClick={() => camera.current?.click()}><span aria-hidden="true">▣</span>Take Photo</button>
      <button type="button" className="photo-source photo-gallery" disabled={disabled || busy} onClick={() => gallery.current?.click()}><span aria-hidden="true">▧</span>Upload Gallery</button>
    </div>
    <label className="report-file-input">Take a photo<input ref={camera} type="file" accept="image/jpeg,image/png" capture="environment" disabled={disabled || busy} onChange={(event) => select(event.target.files?.[0] ?? null)} /></label>
    <label className="report-file-input">Choose from gallery<input ref={gallery} type="file" accept="image/jpeg,image/png" disabled={disabled || busy} onChange={(event) => select(event.target.files?.[0] ?? null)} /></label>
    {previewUrl && <div className="report-photo-card">
      <div className="report-photo-caption"><strong>{file?.name}</strong><span className="report-status">{uploaded ? 'Uploaded privately' : 'Ready to upload'}</span></div>
      <img src={previewUrl} alt="Selected obstacle photo" />
      <div className="report-actions"><button type="button" className="report-secondary" disabled={busy || disabled} onClick={() => gallery.current?.click()}>Retake / Replace</button><button type="button" className="report-danger" disabled={busy || disabled} onClick={() => select(null)}>Remove photo</button></div>
    </div>}
    <label className="report-check"><input type="checkbox" checked={consent} disabled={busy || disabled} onChange={(event) => setConsent(event.target.checked)} />I choose to send this photo to the configured external visual AI service (GLM). This is optional and does not enable avoidance.</label>
    {!flowMode && !uploaded && <button className="report-primary-wide" type="button" disabled={!file || busy || disabled} onClick={() => void upload()}>{busy ? 'Uploading…' : 'Upload private photo'}</button>}
    {flowMode && <div className="photo-continue-actions">
      <button className="report-primary-wide" type="button" disabled={!file || !consent || busy || disabled} onClick={() => void upload(true)}>{busy ? 'Uploading…' : <>Confirm &amp; Analyze Photo <span aria-hidden="true">→</span></>}</button>
      <button className="report-secondary report-primary-wide" type="button" disabled={!file || busy || disabled} onClick={() => void upload(false)}>Continue with manual report</button>
    </div>}
    {error && <p className="report-error" role="alert">{error} The photo has not been saved. Retry uses the same upload operation.</p>}
  </section>
}
