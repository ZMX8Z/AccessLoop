'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState } from 'react';

import type { UploadResponseData } from '../../../shared/contracts';
import { uploadPhoto } from './api';

interface PhotoUploadProps {
  onPhotoUploaded: (data: UploadResponseData, localPreviewUrl: string, consent: boolean) => void;
  disabled?: boolean;
}

export function PhotoUpload({ onPhotoUploaded, disabled = false }: PhotoUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!['image/jpeg', 'image/png'].includes(selected.type)) {
      setError('Only JPEG and PNG formats are supported.');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Image file must be under 5MB.');
      return;
    }

    setError(null);
    setFile(selected);
    const url = URL.createObjectURL(selected);
    setPreviewUrl(url);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);

    try {
      // In development / demo, if server is not fully wired, fallback gracefully
      let res: UploadResponseData;
      try {
        res = await uploadPhoto(file, 'report', false);
      } catch {
        res = await uploadPhoto(file, 'report', true);
      }
      onPhotoUploaded(res, previewUrl || '', consent);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ border: '1px solid #d9e4de', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem', background: '#fafcfb' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: '#163d36' }}>1. Capture or Select Obstacle Photo</h3>
      <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#4e6961' }}>
        Take a clear photo of the passage obstruction (curb, steps, surface damage, or construction).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={handleFileChange}
          disabled={disabled || isUploading}
          style={{ fontSize: '0.9rem' }}
        />

        {previewUrl && (
          <div style={{ marginTop: '0.5rem' }}>
            <img
              src={previewUrl}
              alt="Obstacle preview"
              style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '0.5rem', objectFit: 'cover' }}
            />
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', color: '#163d36', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={disabled || isUploading}
            style={{ marginTop: '0.2rem' }}
          />
          <span>
            <strong>AI Analysis Consent:</strong> I agree to submit this photo to the configured visual AI service (GLM) for obstruction detection and evidence extraction.
          </span>
        </label>

        {error && (
          <div style={{ color: '#b91c1c', fontSize: '0.85rem', padding: '0.5rem', background: '#fef2f2', borderRadius: '0.375rem' }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || disabled || isUploading}
          style={{
            alignSelf: 'flex-start',
            padding: '0.6rem 1.2rem',
            background: file ? '#006b50' : '#a0b5ae',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 600,
            cursor: file && !isUploading ? 'pointer' : 'not-allowed',
          }}
        >
          {isUploading ? 'Uploading & Processing...' : 'Upload Photo'}
        </button>
      </div>
    </div>
  );
}
