import type { PrivateReportDTO, PublicReportDTO } from '@/shared/contracts/hazards'
import { geometryPreviewPath } from '../geometry-preview'

const css = `
  @page{size:A4;margin:20mm}
  body{font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;line-height:1.5;margin:0;padding:24px;background:#fff;max-width:900px;margin-inline:auto}
  .header{border-bottom:2px solid #006b50;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;gap:16px}
  h1{font-size:24px;color:#163d36;margin:0 0 4px}.subtitle{font-size:14px;color:#555;margin:0}
  .badge{font-size:12px;font-weight:700;padding:4px 10px;border-radius:12px;background:#e6f4ea;color:#137333}
  section{margin-bottom:20px}h2{font-size:14px;text-transform:uppercase;color:#4e6961;border-bottom:1px solid #e0e0e0;padding-bottom:4px;margin-bottom:8px}
  dl{display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px}dt{font-weight:600;color:#444}dd{margin:0;overflow-wrap:anywhere}
  img{display:block;max-width:100%;max-height:300px;object-fit:contain}
  .disclaimer{font-size:11px;color:#666;border-top:1px solid #eee;padding-top:12px;margin-top:32px}
  button{padding:10px 18px;background:#006b50;color:#fff;border:0;border-radius:6px;font:inherit;cursor:pointer;margin:12px 12px 0 0}
  svg{width:100%;max-height:210px;background:#eff4f1;border-radius:8px}figcaption{font-size:12px;color:#52665b}
  @media(max-width:480px){body{padding:16px}dl{grid-template-columns:1fr}}
  @media print{body{padding:0}.no-print{display:none}}
`

function escapeHTML(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return character
    }
  })
}
const field = (label: string, value: string | number) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`
const date = (value: string) => new Date(value).toUTCString()

// Presentation adapted from B's adc42779 export template; authorization stays in the endpoint.
export function renderReportTemplateHTML(input: {
  report: PrivateReportDTO | PublicReportDTO; requestId: string; isPrivateView: boolean
}): string {
  const { report, requestId } = input
  const privateReport = input.isPrivateView && 'rowVersion' in report ? report : null
  const personal = privateReport?.personalAvoidance
  const geometry = personal?.avoidGeometry ?? report.publicAvoidGeometry
  const verification = report.publicVerification
  const privateSection = privateReport ? `
    <section><h2>Personal Avoidance Status (Author View)</h2><dl>
      ${field('Personal Avoidance Active', personal?.effective ? 'Effective' : personal?.active ? 'Expired or inactive' : 'Not enabled')}
      ${field('Decision Source', personal?.decisionSource ?? 'Not confirmed')}
      ${personal ? field('User Confirmed At', date(personal.confirmedAt)) + field('Valid Until', date(personal.validUntil)) : ''}
      ${privateReport.analysis ? field('AI Analysis Model', `${privateReport.analysis.model} (${privateReport.analysis.aiStatus})`) : ''}
    </dl><p>${privateReport.analysis?.aiStatus === 'completed'
      ? 'AI-assisted observation. User facts may differ from the original analysis.'
      : 'Manual observation. No completed AI obstacle assessment is attached.'}</p></section>
    <section><h2>Authorized Photo</h2><img src="/api/photos/${escapeHTML(encodeURIComponent(privateReport.photoId))}" alt="Photo attached by the report author"></section>
  ` : ''
  const areaSection = geometry ? `<section><h2>${personal ? 'Personal avoidance area' : 'Publicly recorded area'}</h2>
    <figure><svg viewBox="0 0 320 180" role="img" aria-label="Avoidance area schematic"><path d="${escapeHTML(geometryPreviewPath(geometry))}" fill="#d17b3f" fill-opacity="0.4" stroke="#9b4f25" stroke-width="2" fill-rule="evenodd"></path></svg>
    <figcaption>Area schematic. Geographic scale and surrounding paths are not shown.</figcaption></figure></section>` : ''
  return `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>AccessLoop Obstacle Report - ${escapeHTML(report.id)}</title><style>${css}</style></head><body>
    <div id="report-content"><header class="header"><div><h1>AccessLoop Obstacle Record</h1><p class="subtitle">Accessibility observation record</p></div><div><span class="badge">${escapeHTML(report.status)}</span></div></header>
    ${report.isDemo ? '<p>Demonstration data. This is not a surveyed campus observation.</p>' : ''}
    <section><h2>Report Summary</h2><dl>${field('Report ID', report.id)}${field('Region', report.regionId)}
      ${field('Observed At', date(report.observedAt))}${field('Category', report.category)}
      ${field('Coordinates (WGS84)', report.location.map((value) => value.toFixed(5)).join(', '))}
      ${field('Public Activity State', report.publicActivity)}</dl></section>
    <section><h2>Observation Description</h2><p>${escapeHTML(report.description)}</p></section>
    ${privateSection}${areaSection}
    ${verification ? `<section><h2>Public Verification Evidence</h2><dl>${field('Verification Source', verification.source)}${field('Verified At', date(verification.verifiedAt))}${field('Expiration', date(verification.validUntil))}</dl></section>` : ''}
    <p class="disclaimer">This record shows reported observations and any separately recorded public verification. It does not certify a safe route, an official municipal submission, or a repair commitment. Expiry does not mean an obstacle has disappeared. Request ID: ${escapeHTML(requestId)}.</p></div>
    <div class="no-print"><button id="print-report" type="button">Print This Report</button><button id="copy-report" type="button">Copy Report Text</button><p id="copy-status" role="status"></p></div>
    </body></html>`
}
