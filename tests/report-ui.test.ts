import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PhotoUpload } from '../src/features/hazards/client/PhotoUpload'
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
