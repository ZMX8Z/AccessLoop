import { errorResponse } from '../../../../server/http/errors';
import { routingHandlers } from '../../../../features/routing/server/runtime';
import { methodNotAllowed } from '../../../../features/routing/server/handlers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  try {
    return (await routingHandlers()).places(request);
  } catch (error) {
    return errorResponse(error);
  }
}
const unsupported = () => methodNotAllowed('GET');
export const POST = unsupported;
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const OPTIONS = unsupported;
export const HEAD = unsupported;
