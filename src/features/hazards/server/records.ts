import { z } from 'zod'

import { IdSchema, VersionSchema } from '@/shared/contracts/common'
import { LineStringSchema } from '@/shared/contracts/geo'
import { ReportFactsSchema, ReportStatusSchema } from '@/shared/contracts/hazards'
import { InstantSchema } from '@/shared/contracts/region'
import { SessionHashSchema } from '@/shared/contracts/storage'
import { PassageRefSchema } from '@/shared/contracts/routing'

export const ReportRecordSchema = z.object({
  id: IdSchema,
  regionId: IdSchema,
  ownerSessionHash: SessionHashSchema,
  status: ReportStatusSchema,
  rowVersion: VersionSchema,
  facts: ReportFactsSchema,
  publicSnapshot: z.unknown().optional(),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
})

export const ConfirmationRecordSchema = z.object({
  id: IdSchema,
  reportId: IdSchema,
  regionId: IdSchema,
  ownerSessionHash: SessionHashSchema,
  active: z.boolean(),
  confirmedPath: z.strictObject({ passage: PassageRefSchema, geometry: LineStringSchema }),
  avoidGeometry: z.unknown(),
  decisionSource: z.enum(['ai_user_confirmed', 'user_manual']),
  observedAt: InstantSchema,
  confirmedAt: InstantSchema,
  validUntil: InstantSchema,
  confirmationReportVersion: VersionSchema,
})

export type ReportRecord = z.infer<typeof ReportRecordSchema>
export type ConfirmationRecord = z.infer<typeof ConfirmationRecordSchema>
