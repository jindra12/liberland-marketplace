import { afterEach, describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260627_103000_create_default_bot_user'

type MigrationPayload = Parameters<typeof up>[0]['payload']

const createMockPayload = () => {
  return {
    db: {
      create: vi.fn<MigrationPayload['db']['create']>(async () => ({ id: 'bot-user-id' })),
      delete: vi.fn<MigrationPayload['db']['delete']>(async () => undefined),
    },
    find: vi.fn<MigrationPayload['find']>(async () => ({
      docs: [],
      totalDocs: 0,
    })),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
  } satisfies MigrationPayload
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('default bot user migration', () => {
  it('creates the default bot user when none exists', async () => {
    vi.stubEnv('CHATGPT_KEY', 'test-bot-secret')

    const payload = createMockPayload()

    await up({
      payload,
    })

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: {
          OR: [
            { bot: { equals: true } },
            { email: { equals: 'chatgpt-bot@liberland.marketplace' } },
          ],
        },
      }),
    )
    expect(payload.db.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        data: expect.objectContaining({
          bot: true,
          email: 'chatgpt-bot@liberland.marketplace',
          emailVerified: true,
          name: 'ChatGPT',
          password: 'test-bot-secret',
          role: ['user'],
        }),
      }),
    )
  })

  it('skips creating the bot user when one already exists', async () => {
    vi.stubEnv('CHATGPT_KEY', 'test-bot-secret')

    const payload = createMockPayload()
    payload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 'existing-bot-user',
        },
      ],
      totalDocs: 1,
    })

    await up({
      payload,
    })

    expect(payload.db.create).not.toHaveBeenCalled()
    expect(payload.logger.info).toHaveBeenCalledWith(
      '[migration:create_default_bot_user] Bot user already exists, skipping.',
    )
  })

  it('removes the bot user on down', async () => {
    const payload = createMockPayload()
    payload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 'existing-bot-user',
        },
      ],
      totalDocs: 1,
    })

    await down({
      payload,
    })

    expect(payload.db.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 'existing-bot-user',
      }),
    )
  })
})
