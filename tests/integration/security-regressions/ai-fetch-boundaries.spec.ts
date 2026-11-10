import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { discoverFallbackPosts } from '@/ai/reposts/utils'
import { createDiscoveryClient } from '../../unit/security-regressions/ai/utils'
vi.mock('node:dns/promises', () => ({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
}))

describe('AI article transport boundaries', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not contact a private target reached through a public article redirect', async () => {
    const hits: string[] = []
    const server = createServer((request, response) => {
      hits.push(request.url || '')
      if (request.url === '/article') {
        response.writeHead(302, { location: `http://${request.headers.host}/private` }).end()
        return
      }
      response
        .writeHead(200, { 'content-type': 'text/html' })
        .end('<html><title>Private fixture</title></html>')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('The isolated article fixture did not receive a TCP port.')
    }
    const fetch = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        const request = new Request(input, init)
        // Replace only the fixture's public DNS destination, preserving real HTTP redirect handling.
        return fetch(
          request.url === 'https://public-news.example/article'
            ? `http://127.0.0.1:${address.port}/article`
            : request,
          { redirect: init?.redirect, signal: init?.signal, headers: init?.headers },
        )
      }),
    )
    try {
      await discoverFallbackPosts({
        client: createDiscoveryClient('https://public-news.example/article'),
        companies: [{ id: 'eligible-company', name: 'Eligible company' }],
      })
      expect(hits).not.toContain('/private')
      expect(hits).toEqual(['/article'])
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('stops consuming article bodies at the same two-MiB budget used by the public gateway', async () => {
    const consumed = { bytes: 0 }
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024))
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (consumed.bytes >= 4 * 1024 * 1024) {
            controller.close()
            return
          }
          consumed.bytes += chunk.byteLength
          controller.enqueue(chunk)
        },
      },
      { highWaterMark: 0 },
    )
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(stream, {
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )
    await discoverFallbackPosts({
      client: createDiscoveryClient('https://public-news.example/article'),
      companies: [{ id: 'eligible-company', name: 'Eligible company' }],
    })
    expect(consumed.bytes).toBeGreaterThan(0)
    expect(consumed.bytes).toBeLessThanOrEqual(2 * 1024 * 1024 + chunk.byteLength * 2)
  })
})
