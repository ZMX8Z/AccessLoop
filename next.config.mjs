import { withPayload } from '@payloadcms/next/withPayload'

export default withPayload({
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    // Retire the served HTML demo while retaining the original design files.
    return [
      { source: '/stitch/report-photo.html', destination: '/report', permanent: false },
      { source: '/stitch/report-confirm.html', destination: '/report/confirm', permanent: false },
      { source: '/stitch/my-reports.html', destination: '/my-reports', permanent: false },
      { source: '/stitch/report-detail.html', destination: '/my-reports', permanent: false },
      { source: '/stitch/journey.html', destination: '/route/journey', permanent: false },
      { source: '/stitch/:path*', destination: '/route', permanent: false },
    ]
  },
  // Payload installs a custom webpack hook, so enable the build worker explicitly.
  experimental: {
    cpus: 1,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
})
