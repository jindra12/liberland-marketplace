import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn(async (hostname: string) => {
      if (hostname === 'private.example') {
        return [{ address: '10.0.0.1', family: 4 }]
      }

      return [{ address: '93.184.216.34', family: 4 }]
    }),
  },
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === 'private.example') {
      return [{ address: '10.0.0.1', family: 4 }]
    }

    return [{ address: '93.184.216.34', family: 4 }]
  }),
}))

import { fetchSafeURLResponse, resolveSafeURL } from '@/app/api/share/security'

describe('share security helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects localhost and private targets', async () => {
    await expect(resolveSafeURL('http://localhost/path')).resolves.toBeNull()
    await expect(resolveSafeURL('http://127.0.0.1/path')).resolves.toBeNull()
    await expect(resolveSafeURL('http://private.example/path')).resolves.toBeNull()
  })

  it('allows public targets and blocks redirects to private targets', async () => {
    await expect(resolveSafeURL('https://example.com/path')).resolves.toMatchObject({
      hostname: 'example.com',
      protocol: 'https:',
    })

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            location: 'http://127.0.0.1/metadata',
          },
          status: 302,
        }),
      )

    await expect(fetchSafeURLResponse(new URL('https://example.com/path'))).rejects.toThrow(
      'link must not target a private or local address.',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
