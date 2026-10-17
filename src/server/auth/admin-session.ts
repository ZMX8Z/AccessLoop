import { getPayload } from 'payload'

import config from '@/payload.config'
import { isEnabledAdmin } from '@/collections/Admins'

export async function resolveAdminSession(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  return isEnabledAdmin(user) ? { id: String(user.id), role: user.role } : null
}
