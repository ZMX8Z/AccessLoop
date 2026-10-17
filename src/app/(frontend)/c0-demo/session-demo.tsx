'use client'

import { useState } from 'react'

export function SessionDemo() {
  const [result, setResult] = useState('Ready for a request.')
  const [busy, setBusy] = useState(false)

  async function run(invalid: boolean) {
    setBusy(true)
    try {
      const response = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify(invalid ? { owner: 'not-allowed' } : {}),
      })
      const body: unknown = await response.json()
      setResult(`HTTP ${response.status}\n${JSON.stringify(body, null, 2)}`)
    } catch { setResult('The request could not be completed. Check that the local server is running.') }
    finally { setBusy(false) }
  }

  return <section style={{ border: '1px solid #cad8de', borderRadius: 16, padding: 20, marginBottom: 20 }}>
    <h2 style={{ marginTop: 0 }}>2. Anonymous session</h2>
    <p>Initialize, then repeat: the server reuses this browser&apos;s session. The private cookie cannot be read by this page.</p>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <button disabled={busy} onClick={() => void run(false)} style={{ padding: '12px 18px', borderRadius: 8, border: 0, background: '#006d77', color: 'white', cursor: 'pointer' }}>Initialize / repeat session</button>
      <button disabled={busy} onClick={() => void run(true)} style={{ padding: '12px 18px', borderRadius: 8, border: '1px solid #526873', background: 'white', color: '#172a3a', cursor: 'pointer' }}>Try invalid input</button>
    </div>
    <pre aria-live="polite" style={{ background: '#edf4f6', borderRadius: 8, padding: 16, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14 }}>{busy ? 'Sending request…' : result}</pre>
    <p>Valid requests return 200. The invalid request returns 400 and cannot choose another person&apos;s identity.</p>
  </section>
}
