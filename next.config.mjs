import { withPayload } from '@payloadcms/next/withPayload'

export default withPayload({
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  // Payload installs a custom webpack hook, so enable the build worker explicitly.
  experimental: {
    cpus: 1,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
})
