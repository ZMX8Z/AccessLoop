import type { Metadata } from 'next'
import config, { assertPayloadEnvironment } from '@payload-config'
import { generatePageMetadata, NotFoundPage } from '@payloadcms/next/views'

import { importMap } from '../importMap.js'

type Args = {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<{ [key: string]: string | string[] }>
}

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams })

export default function AdminNotFound({ params, searchParams }: Args) {
  assertPayloadEnvironment()
  return NotFoundPage({ config, params, searchParams, importMap })
}
