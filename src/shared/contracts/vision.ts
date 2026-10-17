import { z } from 'zod'

import { IdSchema } from './common'
import { InstantSchema } from './region'

const visibleText = (maximumLength: number) => z.string().min(1).max(maximumLength).regex(/\S/, 'Text cannot be blank.')

export const VisionResultSchema = z.strictObject({
  image_quality: z.enum(['usable', 'poor', 'unusable']),
  hazard_present: z.boolean().nullable(),
  category: z.enum(['construction', 'steps_or_kerb', 'surface_damage', 'obstruction', 'other', 'uncertain']),
  visible_passage: z.enum(['blocked', 'partially_blocked', 'clear', 'unknown']),
  description: visibleText(1000),
  evidence: z.array(visibleText(300)).max(10),
  uncertainties: z.array(visibleText(300)).max(10),
})
export type VisionResult = z.infer<typeof VisionResultSchema>

export function classifyVisionResult(result: VisionResult): 'completed' | 'uncertain' {
  return result.image_quality === 'usable' && result.hazard_present === true && result.category !== 'uncertain'
    && ['blocked', 'partially_blocked'].includes(result.visible_passage) && result.evidence.some((value) => value.trim().length > 0)
    ? 'completed' : 'uncertain'
}

export const UnavailableReasonSchema = z.enum([
  'no_valid_tool_result', 'invalid_output', 'refused', 'provider_timeout', 'provider_unavailable',
])

const CompletedOutcomeSchema = z.strictObject({
  aiStatus: z.literal('completed'),
  result: VisionResultSchema.refine((value) => classifyVisionResult(value) === 'completed'),
  unavailableReason: z.null(),
})
const UncertainOutcomeSchema = z.strictObject({
  aiStatus: z.literal('uncertain'),
  result: VisionResultSchema.refine((value) => classifyVisionResult(value) === 'uncertain'),
  unavailableReason: z.null(),
})
const UnavailableOutcomeSchema = z.strictObject({
  aiStatus: z.literal('unavailable'), result: z.null(), unavailableReason: UnavailableReasonSchema,
})
export const VisionOutcomeSchema = z.discriminatedUnion('aiStatus', [
  CompletedOutcomeSchema, UncertainOutcomeSchema, UnavailableOutcomeSchema,
])
export type VisionOutcome = z.infer<typeof VisionOutcomeSchema>

const AnalysisMetadata = {
  analysisId: IdSchema, photoId: IdSchema,
  model: z.string().min(1), promptVersion: z.string().min(1), schemaVersion: z.string().min(1),
  createdAt: InstantSchema, cacheHit: z.boolean(),
}
export const AnalysisDTOSchema = z.discriminatedUnion('aiStatus', [
  CompletedOutcomeSchema.extend(AnalysisMetadata), UncertainOutcomeSchema.extend(AnalysisMetadata),
  UnavailableOutcomeSchema.extend(AnalysisMetadata),
])
export type AnalysisDTO = z.infer<typeof AnalysisDTOSchema>

const parameters = z.toJSONSchema(VisionResultSchema, { target: 'draft-7' })
delete parameters.$schema
export const RecordHazardAnalysisTool = {
  type: 'function',
  function: {
    name: 'record_hazard_analysis',
    description: 'Record only visible evidence about a possible passage obstruction.',
    parameters,
  },
} as const

const EnvelopeSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.string(),
    message: z.object({
      refusal: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        type: z.literal('function'),
        function: z.object({ name: z.string(), arguments: z.string() }),
      })).optional(),
    }),
  })).length(1),
})

export function parseGlmToolResult(body: unknown): VisionOutcome {
  const parsed = EnvelopeSchema.safeParse(body)
  if (!parsed.success) return { aiStatus: 'unavailable', result: null, unavailableReason: 'no_valid_tool_result' }
  const choice = parsed.data.choices[0]
  if (choice.message.refusal || ['content_filter', 'sensitive'].includes(choice.finish_reason)) {
    return { aiStatus: 'unavailable', result: null, unavailableReason: 'refused' }
  }
  const calls = choice.message.tool_calls
  if (choice.finish_reason !== 'tool_calls' || calls?.length !== 1 || calls[0].function.name !== RecordHazardAnalysisTool.function.name) {
    return { aiStatus: 'unavailable', result: null, unavailableReason: 'no_valid_tool_result' }
  }
  let arguments_: unknown
  try { arguments_ = JSON.parse(calls[0].function.arguments) }
  catch { return { aiStatus: 'unavailable', result: null, unavailableReason: 'invalid_output' } }
  const result = VisionResultSchema.safeParse(arguments_)
  if (!result.success) return { aiStatus: 'unavailable', result: null, unavailableReason: 'invalid_output' }
  return VisionOutcomeSchema.parse({ aiStatus: classifyVisionResult(result.data), result: result.data, unavailableReason: null })
}
