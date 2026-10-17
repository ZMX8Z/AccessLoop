import nextEnv from '@next/env'
import { getPayload } from 'payload'

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production')
process.env.DISABLE_PAYLOAD_HMR = 'true'

class BootstrapInputError extends Error {}

async function bootstrapAdmin(): Promise<void> {
  if (process.argv.length > 2) {
    throw new BootstrapInputError('This command accepts no arguments. Supply ADMIN_EMAIL and ADMIN_PASSWORD through the environment.')
  }

  const email = process.env.ADMIN_EMAIL?.trim()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BootstrapInputError('Set ADMIN_EMAIL to a valid administrator email address.')
  }
  if (!password || password.length < 12) {
    throw new BootstrapInputError('Set ADMIN_PASSWORD to a password with at least 12 characters.')
  }

  const { default: config, assertPayloadEnvironment } = await import('../src/payload.config')
  assertPayloadEnvironment()

  const payload = await getPayload({ config })
  try {
    const { totalDocs } = await payload.count({ collection: 'admins', overrideAccess: true })
    if (totalDocs !== 0) {
      throw new BootstrapInputError('An administrator already exists. Use the authenticated operator workflow to manage accounts.')
    }
    await payload.create({
      collection: 'admins',
      overrideAccess: true,
      context: { bootstrapAdmin: true },
      data: { email, password, role: 'operator', enabled: true },
    })
    console.info('Initial operator account created.')
  } finally {
    await payload.destroy()
  }
}

// Match Payload's one-shot CLI lifecycle after awaited writes and cleanup.
bootstrapAdmin().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error && (error instanceof BootstrapInputError || error.message.startsWith('Payload is not configured.'))
    ? error.message
    : 'Administrator initialization failed. Check the server environment, database connection, and applied migrations.')
  process.exit(1)
})
