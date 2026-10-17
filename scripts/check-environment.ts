import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())

const required = [
  'DATABASE_URL', 'PAYLOAD_SECRET', 'SESSION_SECRET', 'APP_BASE_URL',
  'OSS_ENDPOINT', 'OSS_BUCKET', 'OSS_REGION',
  'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET',
] as const
const missing = required.filter((key) => !process.env[key]?.trim())

if (missing.length > 0) {
  console.error(`Production startup requires: ${missing.join(', ')}. Configure server-only environment variables.`)
  process.exitCode = 1
}
