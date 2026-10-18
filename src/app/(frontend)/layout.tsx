import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import './stitch-live.css'
import {PublicApp} from '@/shared/client/PublicApp'
import { MapSettingsProvider } from '@/components/map/MapSettings'
import { publicMapSettings } from '@/server/map-settings'

export const metadata: Metadata = {
  title: 'AccessLoop',
  description: 'Accessible place information and temporary obstacle avoidance.',
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><MapSettingsProvider value={publicMapSettings(process.env)}><PublicApp>{children}</PublicApp></MapSettingsProvider></body></html>
}
