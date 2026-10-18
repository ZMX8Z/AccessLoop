'use client'
import React from 'react'
import type { AnalysisDTO } from '@/shared/contracts/vision'
import type { ReportCategory } from './report-state'

interface Props {
  analysis: AnalysisDTO | null; isLoading: boolean
  onApplyFindings: (findings: { category: ReportCategory; description: string; analysisId: string }) => void
  onManualFallback: () => void
}
export function AIAnalysisFeedback({ analysis, isLoading, onApplyFindings, onManualFallback }: Props) {
  if (isLoading) return <section className="report-analysis-feedback" aria-label="AI analysis" role="status"><h3>AI Obstruction Analysis</h3><p>Analyzing your private photo with the configured GLM visual model. This can take about a minute. You can continue manually while analysis finishes.</p><button type="button" className="report-secondary" onClick={onManualFallback}>Continue with Manual Details</button></section>
  if (!analysis) return null
  const { aiStatus, result, unavailableReason } = analysis
  return <section className="report-analysis-feedback" aria-label="AI analysis">
    <div className="report-record-heading"><h3>AI Analysis Findings</h3><span className={`report-status report-analysis-${aiStatus}`}>{aiStatus}</span></div>
    {result && <>
      <p><strong>AI observation{aiStatus === 'uncertain' ? ' (uncertain)' : ''}:</strong> {result.description}</p>
      <p><strong>Suggested category:</strong> {result.category.replaceAll('_', ' ')} · Visible passage: {result.visible_passage}</p>
      {!!result.evidence.length && <><strong>Visible evidence</strong><ul>{result.evidence.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
      {!!result.uncertainties.length && <p className="report-caution"><strong>Uncertainties:</strong> {result.uncertainties.join('; ')}</p>}
    </>}
    {aiStatus === 'unavailable' && <p className="report-caution">Vision service unavailable ({unavailableReason || 'provider timeout'}). No successful AI finding is claimed; continue with your own observations.</p>}
    {aiStatus === 'uncertain' && <p className="report-caution">The AI could not confidently identify the obstruction. Review the evidence and fill in your own facts.</p>}
    <div className="report-actions">
      {aiStatus === 'completed' && result && result.category !== 'uncertain' && <button type="button" onClick={() => onApplyFindings({ category: result.category as ReportCategory, description: result.description, analysisId: analysis.analysisId })}>Use AI Findings</button>}
      <button type="button" className="report-secondary" onClick={onManualFallback}>{aiStatus === 'uncertain' ? 'Continue with Manual Details' : aiStatus === 'unavailable' ? 'Fill Report Manually' : 'Edit / Fill Manually'}</button>
    </div>
  </section>
}
