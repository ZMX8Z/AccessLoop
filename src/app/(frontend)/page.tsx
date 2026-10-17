import Link from 'next/link'

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">Development foundation</p>
      <h1>AccessLoop</h1>
      <p>Accessible places. Temporary obstacles. A clearer way forward.</p>
      <p>The shared application is ready for development. Map, reporting and routing workflows are being built.</p>
      <nav aria-label="Development tools">
        <Link href="/reports/new">Report Obstacle (P0)</Link>
        <Link href="/reports">View Reports</Link>
        <Link href="/admin">Administration (Payload)</Link>
        <a href="/api/health">Application health</a>
      </nav>
    </main>
  )
}
