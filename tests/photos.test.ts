import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { ImageProcessingError, MAX_IMAGE_BYTES, processReportImage } from '../src/server/photos/image'
import { getOssStorageOptions, OssConfigurationError, PHOTO_STORAGE_PREFIX } from '../src/server/photos/oss'

const storageEnv = {
  OSS_ENDPOINT: 'https://s3.oss-ap-northeast-1.aliyuncs.com',
  OSS_BUCKET: 'accessloop-test',
  OSS_REGION: 'ap-northeast-1',
  OSS_ACCESS_KEY_ID: 'test-key',
  OSS_ACCESS_KEY_SECRET: 'test-secret',
}

function rejectsWithCode(code: ImageProcessingError['code']) {
  return (error: unknown) => error instanceof ImageProcessingError && error.code === code
}

test('JPEG and PNG are decoded and returned as matching sanitized bytes with content hashes', async () => {
  for (const format of ['jpeg', 'png'] as const) {
    const input = await sharp({ create: { width: 40, height: 30, channels: 3, background: 'green' } }).toFormat(format).toBuffer()
    const output = await processReportImage(input, `image/${format}`)
    const metadata = await sharp(output.buffer).metadata()
    assert.equal(metadata.format, format)
    assert.equal(output.mime, `image/${format}`)
    assert.equal(output.width, 40)
    assert.equal(output.height, 30)
    assert.equal(output.bytes, output.buffer.length)
    assert.equal(output.imageHash, `sha256:${createHash('sha256').update(output.buffer).digest('hex')}`)
  }
})

test('image processing rejects forged MIME types, unsupported formats and corrupt image bodies', async () => {
  const jpeg = await sharp({ create: { width: 20, height: 10, channels: 3, background: 'red' } }).jpeg().toBuffer()
  await assert.rejects(processReportImage(jpeg, 'image/png'), rejectsWithCode('unsupported_format'))
  await assert.rejects(processReportImage(jpeg, 'application/octet-stream'), rejectsWithCode('unsupported_format'))
  await assert.rejects(processReportImage(Buffer.from('<svg/>'), 'image/png'), rejectsWithCode('unsupported_format'))
  await assert.rejects(processReportImage(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'), rejectsWithCode('invalid_image'))
  await assert.rejects(processReportImage(jpeg.subarray(0, Math.floor(jpeg.length / 2)), 'image/jpeg'), rejectsWithCode('invalid_image'))
})

test('re-encoding applies orientation, strips EXIF and resizes the longest edge to 2048', async () => {
  const input = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: 'blue' } })
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Artist: 'Private location metadata' } })
    .jpeg().toBuffer()
  assert.ok((await sharp(input).metadata()).exif)
  const output = await processReportImage(input, 'image/jpeg')
  const metadata = await sharp(output.buffer).metadata()
  assert.equal(output.width, 1024)
  assert.equal(output.height, 2048)
  assert.equal(metadata.exif, undefined)
  assert.equal(metadata.orientation, undefined)
  assert.equal(metadata.icc, undefined)
})

test('image limits reject original bytes above 5 MiB and decoded images above 20 million pixels', async () => {
  await assert.rejects(processReportImage(Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png'), rejectsWithCode('too_large'))
  const oversized = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: 'white' } }).png().toBuffer()
  assert.ok(oversized.length < MAX_IMAGE_BYTES)
  await assert.rejects(processReportImage(oversized, 'image/png'), rejectsWithCode('too_many_pixels'))
})

test('OSS configuration uses a private server-only adapter with no local fallback or signed client reads', () => {
  const options = getOssStorageOptions(storageEnv)
  assert.equal(options.acl, 'private')
  assert.equal(options.clientUploads, false)
  assert.equal(options.disableLocalStorage, true)
  assert.equal(options.signedDownloads, false)
  assert.equal(options.config.forcePathStyle, false)
  assert.equal(options.config.requestChecksumCalculation, 'WHEN_REQUIRED')
  assert.equal(options.config.responseChecksumValidation, 'WHEN_REQUIRED')
  const photos = options.collections.photos
  assert.equal(photos.prefix, PHOTO_STORAGE_PREFIX)
  assert.equal('disablePayloadAccessControl' in photos, false)
})

test('missing credentials and non-service, mismatched-region or credential-bearing OSS endpoints fail closed', () => {
  for (const invalid of [
    { ...storageEnv, OSS_ACCESS_KEY_ID: '' },
    { ...storageEnv, OSS_ENDPOINT: 'http://s3.oss-ap-northeast-1.aliyuncs.com' },
    { ...storageEnv, OSS_ENDPOINT: 'https://accessloop-test.s3.oss-ap-northeast-1.aliyuncs.com' },
    { ...storageEnv, OSS_ENDPOINT: 'https://s3.oss-cn-hangzhou.aliyuncs.com' },
    { ...storageEnv, OSS_ENDPOINT: 'https://s3.oss-ap-northeast-1.aliyuncs.com/private' },
    { ...storageEnv, OSS_ENDPOINT: 'https://user:password@s3.oss-ap-northeast-1.aliyuncs.com' },
  ]) assert.throws(() => getOssStorageOptions(invalid), OssConfigurationError)
})
