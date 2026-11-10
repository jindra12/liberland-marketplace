import { afterEach, describe, expect, it, vi } from 'vitest'
import { RateLimiterRes } from 'rate-limiter-flexible'
import {
  CLIENT_RAG_SEARCHES_PER_HOUR,
  CLIENT_REQUESTS_PER_MINUTE,
  GLOBAL_REQUESTS_PER_MINUTE,
} from '@/security/constants'

describe('Backend quota isolation', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('does not let one already-limited client exhaust the global request budget', async () => {
    vi.resetModules()
    vi.stubEnv('VERCEL', '0')
    const { limitBackendRequest } = await import('@/security/utils')
    const abusive = new Request('https://backend.example/api/mcp', {
      headers: { 'x-real-ip': '192.0.2.1' },
    })
    await Array.from({ length: GLOBAL_REQUESTS_PER_MINUTE + 1 }).reduce(async (previous) => {
      await previous
      await limitBackendRequest(abusive)
    }, Promise.resolve())
    const healthy = new Request('https://backend.example/api/mcp', {
      headers: { 'x-real-ip': '192.0.2.2' },
    })
    expect(await limitBackendRequest(healthy)).toBeNull()
  })

  it('does not multiply the client allowance by rotating addresses in the same IPv6 prefix', async () => {
    vi.resetModules()
    vi.stubEnv('VERCEL', '0')
    const { limitBackendRequest } = await import('@/security/utils')
    await Array.from({ length: CLIENT_REQUESTS_PER_MINUTE }).reduce(async (previous, _, index) => {
      await previous
      await limitBackendRequest(
        new Request('https://backend.example/api/mcp', {
          headers: { 'x-real-ip': `2001:db8:1234:5678::${index + 1}` },
        }),
      )
    }, Promise.resolve())
    const response = await limitBackendRequest(
      new Request('https://backend.example/api/mcp', {
        headers: { 'x-real-ip': '2001:db8:1234:5678::ffff' },
      }),
    )
    expect(response?.status).toBe(429)
  })

  it('does not trust arbitrary forwarded user addresses to bypass the anonymous gateway bucket', async () => {
    vi.resetModules()
    vi.stubEnv('VERCEL', '0')
    const { consumeRagQuota } = await import('@/security/utils')
    const headers = new Headers({ 'x-real-ip': '192.0.2.10' })
    await Array.from({ length: CLIENT_RAG_SEARCHES_PER_HOUR }).reduce(async (previous) => {
      await previous
      await consumeRagQuota(headers)
    }, Promise.resolve())
    headers.set('x-forwarded-for', '198.51.100.5')
    await expect(consumeRagQuota(headers)).rejects.toBeInstanceOf(RateLimiterRes)
    // This confirms the shared anonymous gateway bucket; it does not assert nginx's deployed trust configuration.
  })
})
