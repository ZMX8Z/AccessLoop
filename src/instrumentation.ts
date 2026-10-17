export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installPersistentRouting } = await import('./server/storage/install-routing')
    installPersistentRouting()
  }
}
