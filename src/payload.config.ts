import { postgresAdapter } from '@payloadcms/db-postgres'
import { en } from '@payloadcms/translations/languages/en'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Admins } from './collections/Admins'
import { BusinessCollections } from './collections/business'
import { Photos } from './collections/Photos'
import { getOssStorageOptions, PHOTO_STORAGE_PREFIX } from './server/photos/oss'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const configuredBaseURL = process.env.APP_BASE_URL?.trim()
export const appOrigin = (() => {
  if (!configuredBaseURL) return undefined
  try {
    const url = new URL(configuredBaseURL)
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : undefined
  } catch {
    return undefined
  }
})()

/** Called at CMS entry points, keeping unrelated public routes and builds independent. */
export function assertPayloadEnvironment(): void {
  const missing = ['DATABASE_URL', 'PAYLOAD_SECRET', 'APP_BASE_URL'].filter((key) => !process.env[key]?.trim())
  if (configuredBaseURL && !appOrigin) {
    throw new Error('Payload is not configured. APP_BASE_URL must be an absolute HTTP or HTTPS URL.')
  }
  if (missing.length > 0) {
    throw new Error(`Payload is not configured. Set server environment variables: ${missing.join(', ')}.`)
  }
}

const hasStorage = ['OSS_ENDPOINT', 'OSS_BUCKET', 'OSS_REGION', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET']
  .every((name) => process.env[name]?.trim())
const storagePlugin = s3Storage(hasStorage ? {
  ...getOssStorageOptions(process.env), alwaysInsertFields: true,
} : {
  enabled: false, alwaysInsertFields: true,
  bucket: 'unconfigured-private-storage',
  config: { region: 'unconfigured', forcePathStyle: false },
  collections: { photos: { prefix: PHOTO_STORAGE_PREFIX } },
  disableLocalStorage: true, clientUploads: false,
})

export default buildConfig({
  admin: {
    user: 'admins',
    importMap: { baseDir: dirname },
    components: {
      beforeDashboard: ['/components/admin/server#AccessLoopDashboard'],
    },
  },
  collections: [Admins, ...BusinessCollections, Photos],
  plugins: [storagePlugin],
  cors: appOrigin ? [appOrigin] : [],
  csrf: appOrigin ? [appOrigin] : [],
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  graphQL: { disable: true },
  i18n: { fallbackLanguage: 'en', supportedLanguages: { en } },
  routes: { admin: '/admin', api: '/cms-api' },
  // Empty configuration is rejected before any actual CMS request or CLI initialization.
  secret: process.env.PAYLOAD_SECRET ?? '',
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
