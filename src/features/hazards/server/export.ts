import { randomBytes, randomUUID } from 'node:crypto'

import type { PrivateReportDTO, PublicReportDTO } from '@/shared/contracts/hazards'
import { renderReportTemplateHTML } from './export-html'


export function renderReportExport(report: PrivateReportDTO | PublicReportDTO): Response {
  const requestId = randomUUID()
  const nonce = randomBytes(18).toString('base64')
  const markup = renderReportTemplateHTML({ report, requestId, isPrivateView: 'rowVersion' in report })
  const script = `<script nonce="${nonce}">document.getElementById('print-report').addEventListener('click',function(){window.print()});document.getElementById('copy-report').addEventListener('click',function(){var s=document.getElementById('copy-status');if(!navigator.clipboard){s.textContent='Select the report text and use your browser copy command.';return;}navigator.clipboard.writeText(document.getElementById('report-content').innerText).then(function(){s.textContent='Report text copied.'},function(){s.textContent='Select the report text and use your browser copy command.'})});</script>`
  return new Response(`<!DOCTYPE html>${markup.replace('</body>', `${script}</body>`)}`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Request-Id': requestId,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
    },
  })
}
