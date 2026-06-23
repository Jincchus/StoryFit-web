export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startMeltingSessionKeeper } = await import('./lib/melting-session-keeper')
    startMeltingSessionKeeper()
  }
}
