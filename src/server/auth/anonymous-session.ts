import { getBusinessRepository } from '@/server/storage/runtime'

import { readSessionCredential, sessionOwnerHash } from './session-cookie'
import { AnonymousSessionRequired } from './errors'

export { AnonymousSessionRequired } from './errors'

export async function requireAnonymousSession(request: Request): Promise<{ ownerSessionHash: string }> {
  const credential = readSessionCredential(request.headers.get('cookie'), process.env.SESSION_SECRET ?? '')
  if (!credential) throw new AnonymousSessionRequired()
  const ownerSessionHash = sessionOwnerHash(credential)
  const repository = await getBusinessRepository()
  try {
    await repository.requireSession(ownerSessionHash)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'NOT_FOUND') {
      throw new AnonymousSessionRequired()
    }
    throw error
  }
  return { ownerSessionHash }
}
