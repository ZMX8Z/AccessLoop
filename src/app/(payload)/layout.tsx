import config, { assertPayloadEnvironment } from '@payload-config'
import '@payloadcms/next/css'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import type { ReactNode } from 'react'
import type { ServerFunctionClient } from 'payload'

import { importMap } from './admin/importMap.js'

export const dynamic = 'force-dynamic'

const serverFunction: ServerFunctionClient = async (args) => {
  'use server'
  assertPayloadEnvironment()
  return handleServerFunctions({ ...args, config, importMap })
}

export default function PayloadLayout({ children }: { children: ReactNode }) {
  assertPayloadEnvironment()
  return <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>{children}</RootLayout>
}
