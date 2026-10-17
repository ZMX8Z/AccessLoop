/* eslint-disable @next/next/no-head-element */
import React from 'react';

import type { PrivateReportDTO, PublicReportDTO } from '../../../shared/contracts';

interface ReportExportTemplateProps {
  report: PrivateReportDTO | PublicReportDTO;
  requestId: string;
  isPrivateView: boolean;
}

export function ReportExportTemplate({
  report,
  requestId,
  isPrivateView,
}: ReportExportTemplateProps) {
  const isPrivate = isPrivateView && 'rowVersion' in report;
  const privateReport = isPrivate ? (report as PrivateReportDTO) : null;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>AccessLoop Obstacle Report - {report.id}</title>
        <style>{`
          @page { size: A4; margin: 20mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1a1a1a;
            line-height: 1.5;
            margin: 0;
            padding: 24px;
            background: #ffffff;
          }
          .header {
            border-bottom: 2px solid #006b50;
            padding-bottom: 16px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .title { font-size: 24px; font-weight: bold; color: #163d36; margin: 0 0 4px; }
          .subtitle { font-size: 14px; color: #555555; margin: 0; }
          .badge {
            display: inline-block;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 4px 10px;
            border-radius: 12px;
            background: #e6f4ea;
            color: #137333;
          }
          .section { margin-bottom: 20px; }
          .section-title {
            font-size: 14px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #4e6961;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 4px;
            margin-bottom: 8px;
          }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; }
          .field-label { font-weight: 600; color: #444444; }
          .field-value { color: #111111; word-break: break-word; }
          .disclaimer {
            font-size: 11px;
            color: #777777;
            border-top: 1px solid #eeeeee;
            padding-top: 12px;
            margin-top: 32px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        `}</style>
      </head>
      <body>
        <div className="header">
          <div>
            <h1 className="title">AccessLoop Obstacle Record</h1>
            <p className="subtitle">Accessibility & Wheelchair Navigation Hazard Certificate</p>
          </div>
          <div>
            <span className="badge">{report.status}</span>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Report Summary</div>
          <div className="grid">
            <div>
              <div className="field-label">Report ID</div>
              <div className="field-value">{report.id}</div>
            </div>
            <div>
              <div className="field-label">Region</div>
              <div className="field-value">{report.regionId}</div>
            </div>
            <div>
              <div className="field-label">Observed At</div>
              <div className="field-value">{new Date(report.observedAt).toUTCString()}</div>
            </div>
            <div>
              <div className="field-label">Category</div>
              <div className="field-value">{report.category}</div>
            </div>
            <div>
              <div className="field-label">Coordinates (WGS84)</div>
              <div className="field-value">
                {report.location[0].toFixed(5)}, {report.location[1].toFixed(5)}
              </div>
            </div>
            <div>
              <div className="field-label">Public Activity State</div>
              <div className="field-value">{report.publicActivity}</div>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Observation Description</div>
          <p style={{ margin: '4px 0', fontSize: '13px' }}>{report.description}</p>
        </div>

        {isPrivate && privateReport && (
          <div className="section">
            <div className="section-title">Personal Avoidance Status (Author View)</div>
            <div className="grid">
              <div>
                <div className="field-label">Personal Avoidance Active</div>
                <div className="field-value">
                  {privateReport.personalAvoidance?.active ? 'Yes (Effective)' : 'No'}
                </div>
              </div>
              <div>
                <div className="field-label">Decision Source</div>
                <div className="field-value">
                  {privateReport.personalAvoidance?.decisionSource || 'N/A'}
                </div>
              </div>
              {privateReport.personalAvoidance?.validUntil && (
                <div>
                  <div className="field-label">Valid Until</div>
                  <div className="field-value">
                    {new Date(privateReport.personalAvoidance.validUntil).toUTCString()}
                  </div>
                </div>
              )}
              {privateReport.analysis && (
                <div>
                  <div className="field-label">AI Analysis Model</div>
                  <div className="field-value">{privateReport.analysis.model} ({privateReport.analysis.aiStatus})</div>
                </div>
              )}
            </div>
          </div>
        )}

        {report.publicVerification && (
          <div className="section">
            <div className="section-title">Public Verification Evidence</div>
            <div className="grid">
              <div>
                <div className="field-label">Verification Source</div>
                <div className="field-value">{report.publicVerification.source}</div>
              </div>
              <div>
                <div className="field-label">Verified At</div>
                <div className="field-value">
                  {new Date(report.publicVerification.verifiedAt).toUTCString()}
                </div>
              </div>
              <div>
                <div className="field-label">Expiration</div>
                <div className="field-value">
                  {new Date(report.publicVerification.validUntil).toUTCString()}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="disclaimer">
          <strong>Data Notice & Limitations:</strong> This report is generated dynamically by AccessLoop for assistive navigation purposes.
          It reflects temporary peer-reported and verified accessibility barriers. It does not constitute an official municipal roadwork notice or repair commitment.
          Request ID: {requestId}.
        </div>

        <div className="no-print" style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            onClick={() => typeof window !== 'undefined' && window.print()}
            style={{
              padding: '8px 20px',
              background: '#006b50',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Print This Report
          </button>
        </div>
      </body>
    </html>
  );
}
