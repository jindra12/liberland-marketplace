import { afterEach, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { Payload, PaginatedDocs } from 'payload'
import type { Company, Post } from '@/payload-types'
import type { LookupAllOptions, LookupAddress } from 'node:dns'
import { createGuardedLookup, GuardedFetchErrorCode } from 'guarded-fetch'
import { resolveSafeURL } from '@/app/api/share/security'
import { fetchPublicResource } from '@/security/utils'
import { createShareRepost } from '@/app/api/share/service'

vi.mock('@payload-config', () => ({ default: {} }))
const { lookupAll } = vi.hoisted(() => ({
  lookupAll: vi.fn<(hostname: string, options: LookupAllOptions) => Promise<LookupAddress[]>>(),
}))
vi.mock('node:dns/promises', () => ({ lookup: lookupAll }))
vi.mock('node:dns', async (original) => ({
  default: {
    ...(await original<typeof import('node:dns')>()),
    lookup: (
      _hostname: string,
      _options: LookupAllOptions,
      callback: Parameters<ReturnType<typeof createGuardedLookup>>[2],
    ) => callback(null, [{ address: '127.0.0.1', family: 4 }]),
  },
}))

describe('Share fetch resource and address boundaries', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('reads an ordinary public article through the guarded transport', async () => {
    lookupAll.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('Public fixture', {
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )
    const resource = await fetchPublicResource('https://public.example/article')
    expect(new TextDecoder().decode(resource.bytes)).toBe('Public fixture')
    expect(resource.response.headers.get('content-type')).toBe('text/html')
    expect(fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        redirect: 'manual',
        dispatcher: expect.any(Object),
      }),
    )
  })

  it('blocks a redirect from a public page into a loopback address before the second fetch', async () => {
    lookupAll.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchPublicResource(new URL('https://public.example/article')),
    ).rejects.toMatchObject({ code: GuardedFetchErrorCode.REDIRECT_TO_UNSAFE_HOST })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects mixed public/private DNS responses', async () => {
    lookupAll.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])
    expect(await resolveSafeURL('https://public.example/article')).toBeNull()
  })

  it('rechecks a host that changes from public to private between link validation and fetching', async () => {
    lookupAll
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const url = await resolveSafeURL('https://public.example/article')
    expect(url).not.toBeNull()
    const fetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', fetch)
    await expect(fetchPublicResource(url!)).rejects.toMatchObject({
      code: GuardedFetchErrorCode.HOSTNAME_UNSAFE,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a DNS rebind inside the socket lookup, after a public preflight succeeded', async () => {
    lookupAll.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    expect(await resolveSafeURL('https://public.example/article')).not.toBeNull()
    const result = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      createGuardedLookup()('public.example', { all: true }, (error) => resolve(error))
    })
    expect(result).toMatchObject({ code: GuardedFetchErrorCode.HOSTNAME_UNSAFE })
  })

  it('does not consume an oversized article before creating its repost', async () => {
    lookupAll.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const consumed = { bytes: 0 }
    const chunk = new TextEncoder().encode('x'.repeat(65536))
    const body = new ReadableStream<Uint8Array>(
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
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/html' } })),
    )
    const payload = mockDeep<Payload>()
    payload.findByID.mockResolvedValue(
      mock<Company>({ id: 'company', name: 'Company', createdBy: 'user', noAutoPost: false }),
    )
    payload.find.mockResolvedValue(
      mock<PaginatedDocs<Company>>({
        docs: [
          mock<Company>({ id: 'company', name: 'Company', createdBy: 'user', noAutoPost: false }),
        ],
        totalDocs: 1,
      }),
    )
    payload.create.mockResolvedValue(mock<Post>({ id: 'post' }))
    const outcome = await Promise.allSettled([
      createShareRepost({
        companyId: 'company',
        link: 'https://public.example/article',
        payload,
        user: { id: 'user', role: ['user'] },
      }),
    ])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(outcome[0].status).toBe('rejected')
    expect(payload.create).not.toHaveBeenCalled()
    if (outcome[0].status === 'rejected') {
      expect(outcome[0].reason.name).toBe('MaxBufferError')
    }
    expect(consumed.bytes).toBeGreaterThan(0)
    expect(consumed.bytes).toBeLessThanOrEqual(2 * 1024 * 1024 + chunk.byteLength * 2)
  })
})
