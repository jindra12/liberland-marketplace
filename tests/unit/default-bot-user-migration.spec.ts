import { afterEach, describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260627_103000_create_default_bot_user'

type MockPayload = {
  create: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
  logger: {
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
  }
}

const createMockPayload = (): MockPayload => {
  return {
    create: vi.fn(async () => ({ id: 'bot-user-id' })),
    delete: vi.fn(async () => undefined),
    find: vi.fn(async () => ({
      docs: [],
      totalDocs: 0,
    })),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
  }
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
      payload: payload as never,
      session: undefined as never,
    })

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: {
          bot: {
            equals: true,
          },
        },
      }),
    )
    expect(payload.create).toHaveBeenCalledWith(
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
        overrideAccess: true,
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
      payload: payload as never,
      session: undefined as never,
    })

    expect(payload.create).not.toHaveBeenCalled()
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
      payload: payload as never,
    })

    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 'existing-bot-user',
        overrideAccess: true,
      }),
    )
  })
})
