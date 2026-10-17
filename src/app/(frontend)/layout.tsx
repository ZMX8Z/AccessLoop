import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './styles.css'

export const metadata: Metadata = {
  title: 'AccessLoop',
  description: 'Accessible place information and temporary obstacle avoidance.',
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
