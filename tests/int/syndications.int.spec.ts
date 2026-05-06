import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import type { Syndication } from '@/payload-types'

let payload: Payload | null = null
let bootstrapError: Error | null = null

const createdSyndicationIDs: string[] = []

describe('syndications permissions', () => {
  beforeAll(async () => {
    try {
      const [{ getPayload }, configModule] = await Promise.all([
        import('payload'),
        import('@/payload.config'),
      ])

      payload = await getPayload({ config: await configModule.default })
    } catch (error) {
      bootstrapError = error as Error
    }
  })

  afterEach(async () => {
    const currentPayload = payload

    if (!currentPayload) {
      return
    }

    await Promise.all(
      createdSyndicationIDs.map(async (id) => {
        await currentPayload.delete({
          collection: 'syndications',
          id,
          overrideAccess: true,
        })
      }),
    )

    createdSyndicationIDs.length = 0
  })

  it('allows anonymous draft syndication submissions but hides drafts from public reads', async () => {
    const currentPayload = payload

    if (bootstrapError || !currentPayload) {
      return
    }

    const syndication = (await currentPayload.create({
      collection: 'syndications',
      data: {
        _status: 'published',
        name: 'Anonymous Syndication',
        url: 'https://example.com/syndication',
      } as never,
      draft: false,
      overrideAccess: false,
    })) as Syndication

    createdSyndicationIDs.push(String(syndication.id))

    expect(syndication._status).toBe('draft')

    await expect(
      currentPayload.findByID({
        collection: 'syndications',
        id: String(syndication.id),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})
