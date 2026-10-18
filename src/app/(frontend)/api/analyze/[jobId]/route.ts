import { readAnalysisTask } from '@/features/hazards/server/http'
import { methodNotAllowed } from '@/server/http/c1-request'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return readAnalysisTask(request, (await context.params).jobId)
}
export const POST = () => methodNotAllowed('GET')
export const PUT = POST
export const PATCH = POST
export const DELETE = POST
