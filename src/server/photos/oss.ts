import type { S3StorageOptions } from '@payloadcms/storage-s3'
import { z } from 'zod'

export const PHOTO_STORAGE_PREFIX = 'accessloop/photos'

const ossEnvironmentSchema = z.object({
  OSS_ENDPOINT: z.url(),
  OSS_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  OSS_REGION: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)+$/),
  OSS_ACCESS_KEY_ID: z.string().trim().min(1),
  OSS_ACCESS_KEY_SECRET: z.string().trim().min(1),
})

export class OssConfigurationError extends Error {
  constructor() {
    super('OSS server configuration is missing or invalid.')
    this.name = 'OssConfigurationError'
  }
}

export function getOssStorageOptions(env: unknown) {
  const parsed = ossEnvironmentSchema.safeParse(env)
  if (!parsed.success) throw new OssConfigurationError()
  const config = parsed.data
  const endpoint = new URL(config.OSS_ENDPOINT)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port ||
    endpoint.pathname !== '/' || endpoint.search || endpoint.hash ||
    !/^s3\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(endpoint.hostname) ||
    endpoint.hostname !== `s3.oss-${config.OSS_REGION}.aliyuncs.com`) {
    throw new OssConfigurationError()
  }

  return {
    acl: 'private',
    bucket: config.OSS_BUCKET,
    clientUploads: false,
    disableLocalStorage: true,
    signedDownloads: false,
    collections: {
      photos: {
        prefix: PHOTO_STORAGE_PREFIX,
        signedDownloads: false,
      },
    },
    config: {
      endpoint: endpoint.origin,
      region: config.OSS_REGION,
      forcePathStyle: false,
      credentials: {
        accessKeyId: config.OSS_ACCESS_KEY_ID,
        secretAccessKey: config.OSS_ACCESS_KEY_SECRET,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 1,
      requestHandler: {
        connectionTimeout: 5000,
        requestTimeout: 15000,
      },
    },
  } satisfies S3StorageOptions
}
