import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverFallbackPosts } from '@/ai/reposts/utils'
import { PUBLIC_FETCH_TIMEOUT_MS } from '@/security/constants'
import { createDiscoveryClient } from './ai/utils'
vi.mock('node:dns/promises', () => ({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
}))

describe('AI repost source boundaries', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each(['http://127.0.0.1/admin', 'http://169.254.169.254/latest/meta-data/'])(
    'does not fetch private infrastructure returned by the model: %s',
    async (url) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(
          new Response('<html><title>Private service</title><body>Private content</body></html>'),
        )
      vi.stubGlobal('fetch', fetch)
      await discoverFallbackPosts({
        client: createDiscoveryClient(url),
        companies: [{ id: 'eligible-company', name: 'Eligible company' }],
      })
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('bounds a stalled HTML body as well as the response headers', async () => {
    const deadline = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    const startReading = vi.fn<() => void>()
    const reading = new Promise<void>((resolve) => startReading.mockImplementation(resolve))
    const response = new Response(
      new ReadableStream<Uint8Array>(
        {
          pull() {
            startReading()
          },
        },
        { highWaterMark: 0 },
      ),
      { headers: { 'content-type': 'text/html' } },
    )
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockResolvedValue(response))
    const state = { finished: false }
    const scan = async () => {
      try {
        await discoverFallbackPosts({
          client: createDiscoveryClient('https://public-news.example/article'),
          companies: [{ id: 'eligible-company', name: 'Eligible company' }],
        })
      } finally {
        state.finished = true
      }
    }
    const work = scan()
    try {
      await reading
      deadline.abort(new DOMException('Deadline reached', 'TimeoutError'))
      await work
      expect(state.finished).toBe(true)
      expect(AbortSignal.timeout).toHaveBeenCalledWith(PUBLIC_FETCH_TIMEOUT_MS)
    } finally {
      deadline.abort()
      await work
    }
  })
})
