import { beforeEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ShareUser } from '@/app/api/share/utils'

let shareGet: ((request: Request) => Promise<Response>) | null = null
const serverURL = 'http://localhost:3001'

const mockUser = {
  id: 'user-1',
  name: 'Share API User',
} satisfies ShareUser & { name: string }

const mockPayload = {
  auth: vi.fn(async ({ headers }: { headers: Headers }) => {
    if (headers.get('authorization') === 'Bearer valid-token') {
      return { user: mockUser }
    }

    if (headers.get('authorization') === 'Bearer bot-token') {
      return {
        user: {
          bot: true,
          id: 'bot-user-1',
          name: 'ChatGPT',
        } satisfies ShareUser & { name: string },
      }
    }

    return { user: null }
  }),
  create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
    if (collection === 'media') {
      return {
        id: 'media-1',
      }
    }

    if (collection === 'posts') {
      return {
        id: 'post-1',
        ...data,
      }
    }

    throw new Error(`Unexpected collection: ${collection}`)
  }),
  find: vi.fn(async () => ({
    docs: [
      {
        id: 'company-1',
        name: 'User Company',
        noAutoPost: false,
      },
    ],
  })),
  findByID: vi.fn(async () => ({
    id: 'company-9',
    name: 'Foreign Company',
    noAutoPost: false,
  })),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => mockPayload),
}))

vi.mock('@payload-config', () => ({
  default: {},
}))

describe('share API', () => {
  beforeAll(async () => {
    const routeModule = await import('@/app/api/share/route')
    shareGet = routeModule.GET
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests before validating the query string', async () => {
    if (!shareGet) {
      throw new Error('Share route is not available.')
    }

    const response = await shareGet(new Request(`${serverURL}/api/share`))

    expect(response.status).toBe(401)
    expect(mockPayload.auth).toHaveBeenCalled()
    expect(mockPayload.find).not.toHaveBeenCalled()
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it('creates a repost post from an authenticated share request', async () => {
    if (!shareGet) {
      throw new Error('Share route is not available.')
    }

    const pageURL = 'https://source.example.com/articles/hello-world'
    const imageURL = 'https://source.example.com/assets/hero.jpg'

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const resolvedURL = typeof input === 'string' ? input : input.toString()

      if (resolvedURL === pageURL) {
        return new Response(
          `
            <html>
              <head>
                <title>Head title</title>
                <meta name="description" content="Head description">
                <meta property="og:image" content="${imageURL}">
              </head>
              <body>
                <h1>Fallback title</h1>
                <p>Fallback paragraph.</p>
                <img src="/small.jpg" width="100" height="100">
                <img src="/large.jpg" width="200" height="300">
              </body>
            </html>
          `,
          {
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          },
        )
      }

      if (resolvedURL === imageURL) {
        return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
          headers: {
            'content-type': 'image/jpeg',
          },
        })
      }

      throw new Error(`Unexpected fetch URL: ${resolvedURL}`)
    })

    let response: Response | null = null

    try {
      response = await shareGet(
        new Request(`${serverURL}/api/share?link=${encodeURIComponent(pageURL)}&companyId=company-1`, {
          headers: {
            authorization: 'Bearer valid-token',
          },
        }),
      )
    } finally {
      fetchSpy.mockRestore()
    }

    if (!response) {
      throw new Error('Share route did not return a response.')
    }

    const body = (await response.json()) as {
      company?: {
        id?: string
        name?: string
      }
      post?: {
        content?: string
        heroImage?: string | { id?: string }
        id?: string
        repost?: string
        title?: string
      }
      source?: {
        description?: string
        imageURL?: string | null
        isSinglePageApp?: boolean
        link?: string
        title?: string
      }
    }

    expect(response.status).toBe(200)
    expect(body.company).toMatchObject({
      id: 'company-1',
      name: 'User Company',
    })
    expect(body.source).toMatchObject({
      description: 'Head description',
      imageURL,
      isSinglePageApp: false,
      link: pageURL,
      title: 'Head title',
    })
    expect(body.post).toMatchObject({
      content: expect.stringContaining('Head description'),
      repost: pageURL,
      title: 'Head title',
    })
    expect(mockPayload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'companies',
        overrideAccess: false,
      }),
    )
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'media',
      }),
    )
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
      }),
    )
  })

  it('blocks automated posting when the company opts out', async () => {
    if (!shareGet) {
      throw new Error('Share route is not available.')
    }

    mockPayload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 'company-2',
          name: 'No Auto Post Company',
          noAutoPost: true,
        },
      ],
    })

    const response = await shareGet(
      new Request(
        `${serverURL}/api/share?link=${encodeURIComponent('https://source.example.com/articles/hello-world')}&companyId=company-2`,
        {
          headers: {
            authorization: 'Bearer valid-token',
          },
        },
      ),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: 'Automated posting is disabled for this company.',
    })
  })

  it('lets bot users repost to a company they do not own when auto posting is enabled', async () => {
    if (!shareGet) {
      throw new Error('Share route is not available.')
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const resolvedURL = typeof input === 'string' ? input : input.toString()

      if (resolvedURL === 'https://source.example.com/articles/hello-world') {
        return new Response(
          `
            <html>
              <head>
                <title>Head title</title>
                <meta name="description" content="Head description">
                <meta property="og:image" content="https://source.example.com/assets/hero.jpg">
              </head>
              <body>
                <h1>Fallback title</h1>
                <p>Fallback paragraph.</p>
              </body>
            </html>
          `,
          {
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          },
        )
      }

      if (resolvedURL === 'https://source.example.com/assets/hero.jpg') {
        return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
          headers: {
            'content-type': 'image/jpeg',
          },
        })
      }

      throw new Error(`Unexpected fetch URL: ${resolvedURL}`)
    })

    let response: Response | null = null

    try {
      response = await shareGet(
        new Request(
          `${serverURL}/api/share?link=${encodeURIComponent('https://source.example.com/articles/hello-world')}&companyId=company-9`,
          {
            headers: {
              authorization: 'Bearer bot-token',
            },
          },
        ),
      )
    } finally {
      fetchSpy.mockRestore()
    }

    if (!response) {
      throw new Error('Share route did not return a response.')
    }

    expect(response.status).toBe(200)
    expect(mockPayload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'companies',
        id: 'company-9',
        overrideAccess: false,
      }),
    )
  })
})
