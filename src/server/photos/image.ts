import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 20_000_000
export const MAX_IMAGE_EDGE = 2048

export type PhotoMime = 'image/jpeg' | 'image/png'
export type ImageProcessingErrorCode = 'unsupported_format' | 'too_large' | 'too_many_pixels' | 'invalid_image'

export class ImageProcessingError extends Error {
  constructor(readonly code: ImageProcessingErrorCode) {
    super({
      unsupported_format: 'Only matching JPEG or PNG image content is accepted.',
      too_large: 'The original image exceeds 5 MiB.',
      too_many_pixels: 'The original image exceeds 20 million pixels.',
      invalid_image: 'The image could not be decoded safely.',
    }[code])
    this.name = 'ImageProcessingError'
  }
}

function identifyMime(bytes: Buffer): PhotoMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return null
}

export async function processReportImage(bytes: Buffer, mime: string) {
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageProcessingError('too_large')
  if ((mime !== 'image/jpeg' && mime !== 'image/png') || identifyMime(bytes) !== mime) {
    throw new ImageProcessingError('unsupported_format')
  }

  try {
    // Metadata is read before pixel decoding so oversized images have a stable error category.
    const metadata = await sharp(bytes, { failOn: 'warning', limitInputPixels: false }).metadata()
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
      throw new ImageProcessingError('invalid_image')
    }
    if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) throw new ImageProcessingError('too_many_pixels')
    if ((metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'png' ? 'image/png' : null) !== mime) {
      throw new ImageProcessingError('unsupported_format')
    }

    const pipeline = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_IMAGE_PIXELS })
      .autoOrient()
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
    const output = await (mime === 'image/jpeg' ? pipeline.jpeg({ quality: 85 }) : pipeline.png({ compressionLevel: 9 }))
      .toBuffer({ resolveWithObject: true })

    return {
      buffer: output.data,
      mime,
      bytes: output.data.length,
      width: output.info.width,
      height: output.info.height,
      imageHash: `sha256:${createHash('sha256').update(output.data).digest('hex')}`,
    }
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error
    throw new ImageProcessingError('invalid_image')
  }
}
