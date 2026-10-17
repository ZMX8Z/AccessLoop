import { z } from 'zod'

import { IdSchema } from './common'

export const SessionInputSchema = z.strictObject({})
export const SessionDataSchema = z.strictObject({
  ready: z.literal(true),
  regionId: IdSchema,
  isDemo: z.boolean(),
})
export type SessionData = z.infer<typeof SessionDataSchema>
