import { z } from 'zod'

import { IdSchema } from './common'

export const PhotoPurposeSchema = z.enum(['report', 'review_evidence'])
export const PhotoMimeSchema = z.enum(['image/jpeg', 'image/png'])
export const UploadDTOSchema = z.strictObject({
  photoId: IdSchema,
  purpose: PhotoPurposeSchema,
  mime: PhotoMimeSchema,
  bytes: z.number().int().positive(),
  width: z.number().int().min(1).max(2048),
  height: z.number().int().min(1).max(2048),
})

export type PhotoPurpose = z.infer<typeof PhotoPurposeSchema>
export type UploadDTO = z.infer<typeof UploadDTOSchema>
