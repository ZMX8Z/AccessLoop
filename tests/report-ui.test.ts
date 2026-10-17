import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PhotoUpload } from '../src/features/hazards/client/PhotoUpload'
import { AIAnalysisFeedback } from '../src/features/hazards/client/AIAnalysisFeedback'
import { ReportForm } from '../src/features/hazards/client/ReportForm'

test('external AI consent starts unchecked until the person selects it', () => {
  const html = renderToStaticMarkup(React.createElement(PhotoUpload, { onPhotoUploaded: () => undefined }))
  const consent = html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0]
  assert.ok(consent)
  assert.doesNotMatch(consent, /checked/)
})

test('report facts require an editable observation time instead of fabricating submission time', () => {
  const html = renderToStaticMarkup(React.createElement(ReportForm, {
    photoId: 'photo-test', onReportCreated: () => undefined,
  }))
  assert.match(html, /type="datetime-local"/)
  assert.doesNotMatch(html, /passage-library-walk|passage-ancete-walk|passage-quadrangle/)
})


test('uncertain AI findings still expose the saved description, evidence and uncertainty', () => {
  const html = renderToStaticMarkup(React.createElement(AIAnalysisFeedback, {
    analysis: { analysisId: 'analysis-uncertain', photoId: 'photo-uncertain', aiStatus: 'uncertain', unavailableReason: null,
      model: 'glm-4.6v', promptVersion: '1', schemaVersion: '1', createdAt: '2020-01-01T00:00:00.000Z', cacheHit: false,
      result: { image_quality: 'poor', hazard_present: true, category: 'obstruction', visible_passage: 'unknown',
        description: 'The path edge is partially visible.', evidence: ['A bin covers part of the frame.'], uncertainties: ['The whole passage is outside the frame.'] } },
    isLoading: false, onApplyFindings: () => undefined, onManualFallback: () => undefined,
  }))
  assert.match(html, /The path edge is partially visible/)
  assert.match(html, /A bin covers part of the frame/)
  assert.match(html, /The whole passage is outside the frame/)
  assert.match(html, /Continue with Manual Details/)
})
