import { describe, expect, it, vi } from 'vitest'

import {
  extractShareMetadataFromHTML,
  resolveShareCompany,
  type SharePayload,
  type ShareUser,
} from '@/app/api/share/utils'

describe('share utils', () => {
  const createPayload = ({
    findByIDDoc,
    findDocsSequence = [],
  }: {
    findByIDDoc?: {
      id: string
      name: string
    }
    findDocsSequence?: Array<
      Array<{
        id: string
        name: string
      }>
    >
  }) => {
    const find = vi.fn(async () => {
      const docs = findDocsSequence.shift() ?? []

      return {
        docs,
        totalDocs: docs.length,
      }
    })
    const findByID = vi.fn(async () => {
      if (!findByIDDoc) {
        throw new Error('No company was configured for findByID.')
      }

      return findByIDDoc
    })

    return {
      find,
      findByID,
    } satisfies SharePayload
  }

  it('extracts SEO metadata from head tags', async () => {
    const metadata = await extractShareMetadataFromHTML({
      html: `
        <html>
          <head>
            <title>Head Title</title>
            <meta name="description" content="Head description">
            <meta property="og:image" content="https://example.com/image.jpg">
          </head>
          <body>
            <h1>Fallback title</h1>
            <p>Fallback description</p>
          </body>
        </html>
      `,
      pageURL: 'https://example.com/page',
    })

    expect(metadata).toMatchObject({
      description: 'Head description',
      imageURL: 'https://example.com/image.jpg',
      isSinglePageApp: false,
      title: 'Head Title',
    })
  })

  it('falls back to SPA body content when head metadata is missing', async () => {
    const metadata = await extractShareMetadataFromHTML({
      html: `
        <html>
          <head></head>
          <body>
            <div id="root"></div>
            <h1>SPA title</h1>
            <p>Short</p>
            <p>This is the biggest paragraph in the page body.</p>
            <img src="/small.jpg" width="100" height="100">
            <img src="/large.jpg" width="200" height="300">
          </body>
        </html>
      `,
      pageURL: 'https://example.com/app',
    })

    expect(metadata).toMatchObject({
      description: 'This is the biggest paragraph in the page body.',
      imageURL: 'https://example.com/large.jpg',
      isSinglePageApp: true,
      title: 'SPA title',
    })
  })

  it('resolves the current user company or rejects foreign companies', async () => {
    const payload = createPayload({
      findDocsSequence: [
        [{ id: 'company-1', name: 'Company One' }],
        [],
      ],
    })
    const user = { id: 'user-1' } satisfies ShareUser

    const ownedCompany = await resolveShareCompany({
      companyId: null,
      payload,
      user,
    })

    expect(ownedCompany.id).toBe('company-1')
    expect(payload.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: 'companies',
        overrideAccess: false,
        user: { id: 'user-1' },
      }),
    )

    await expect(
      resolveShareCompany({
        companyId: 'company-2',
        payload,
        user,
      }),
    ).rejects.toMatchObject({
      message: 'You do not own that company.',
      status: 403,
    })
  })

  it('allows admins to resolve any company by id', async () => {
    const payload = createPayload({
      findByIDDoc: {
        id: 'company-9',
        name: 'Admin Company',
      },
    })
    const user = { id: 'admin-1', role: ['admin'] } satisfies ShareUser

    const company = await resolveShareCompany({
      companyId: 'company-9',
      payload,
      user,
    })

    expect(company.id).toBe('company-9')
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'companies',
        id: 'company-9',
        overrideAccess: false,
        user,
      }),
    )
  })

  it('allows bot users to resolve any company by id', async () => {
    const payload = createPayload({
      findByIDDoc: {
        id: 'company-11',
        name: 'Bot Company',
      },
    })
    const user = { id: 'bot-1', bot: true } satisfies ShareUser

    const company = await resolveShareCompany({
      companyId: 'company-11',
      payload,
      user,
    })

    expect(company.id).toBe('company-11')
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'companies',
        id: 'company-11',
        overrideAccess: false,
        user,
      }),
    )
  })
})
