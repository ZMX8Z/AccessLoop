'use client';

import Link from 'next/link';
import React, { useState } from 'react';

import type {
  AnalysisDTO,
  PrivateReportDTO,
  ReportCategory,
  UploadResponseData,
} from '../../../shared/contracts';
import { AIAnalysisFeedback } from './AIAnalysisFeedback';
import { analyzePhoto } from './api';
import { AvoidanceDrawer } from './AvoidanceDrawer';
import { PhotoUpload } from './PhotoUpload';
import { ReportForm } from './ReportForm';

export function ReportWizard() {
  const [photoData, setPhotoData] = useState<UploadResponseData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisDTO | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeReport, setActiveReport] = useState<PrivateReportDTO | null>(null);

  const [formCategory, setFormCategory] = useState<ReportCategory>('construction');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formAnalysisId, setFormAnalysisId] = useState<string | undefined>(undefined);

  const handlePhotoUploaded = async (
    data: UploadResponseData,
    localPreviewUrl: string,
    consent: boolean,
  ) => {
    setPhotoData(data);
    setActiveReport(null);

    if (consent) {
      setIsAnalyzing(true);
      try {
        let a: AnalysisDTO;
        try {
          a = await analyzePhoto(data.photoId, true, false);
        } catch {
          a = await analyzePhoto(data.photoId, true, true);
        }
        setAnalysis(a);
        if (a.aiStatus === 'completed' && a.result && a.result.category !== 'uncertain') {
          setFormCategory(a.result.category as ReportCategory);
          setFormDescription(a.result.description);
          setFormAnalysisId(a.analysisId);
        }
      } catch {
        // Fallback to manual
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleApplyAIFindings = (findings: {
    category: ReportCategory;
    description: string;
    analysisId: string;
  }) => {
    setFormCategory(findings.category);
    setFormDescription(findings.description);
    setFormAnalysisId(findings.analysisId);
  };

  return (
    <div style={{ maxWidth: '42rem', margin: '0 auto', padding: '1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.8rem', color: '#163d36', margin: '0 0 0.5rem' }}>
          Report Passage Obstacle
        </h2>
        <p style={{ color: '#4e6961', margin: 0, fontSize: '0.95rem' }}>
          Upload a photo to detect accessibility barriers, confirm the details, and immediately route your wheelchair around the affected path.
        </p>
      </div>

      {/* Step 1: Upload Photo */}
      <PhotoUpload onPhotoUploaded={handlePhotoUploaded} />

      {/* Step 2: AI Analysis Display (if photo uploaded) */}
      {photoData && (
        <AIAnalysisFeedback
          analysis={analysis}
          isLoading={isAnalyzing}
          onApplyFindings={handleApplyAIFindings}
          onManualFallback={() => setFormAnalysisId(undefined)}
        />
      )}

      {/* Step 3: Fact Gathering & Creation */}
      {photoData && !activeReport && (
        <ReportForm
          photoId={photoData.photoId}
          analysisId={formAnalysisId}
          initialCategory={formCategory}
          initialDescription={formDescription}
          onReportCreated={(created) => setActiveReport(created)}
        />
      )}

      {/* Step 4: Avoidance Confirmation & Export */}
      {activeReport && (
        <>
          <div style={{ background: '#e6f4ea', border: '1px solid #b7e1cd', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem', color: '#137333' }}>
            <h4 style={{ margin: '0 0 0.25rem' }}>✓ Obstacle Report Draft Saved!</h4>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>
              Report ID: <strong>{activeReport.id}</strong> (Status: <code>{activeReport.status}</code>, Version: {activeReport.rowVersion})
            </p>
          </div>

          <AvoidanceDrawer
            report={activeReport}
            onUpdated={(updated) => setActiveReport(updated)}
          />

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <Link
              href={`/reports/${encodeURIComponent(activeReport.id)}/export`}
              target="_blank"
              style={{
                padding: '0.6rem 1.2rem',
                background: '#ffffff',
                color: '#006b50',
                border: '1px solid #006b50',
                borderRadius: '0.5rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              🖨️ View & Print Official Report
            </Link>
            <button
              type="button"
              onClick={() => {
                setPhotoData(null);
                setAnalysis(null);
                setActiveReport(null);
              }}
              style={{
                padding: '0.6rem 1.2rem',
                background: '#f1f3f4',
                color: '#3c4043',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Report Another Obstacle
            </button>
          </div>
        </>
      )}
    </div>
  );
}
