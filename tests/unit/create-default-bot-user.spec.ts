import { describe, expect, it, vi } from 'vitest'

import { createDefaultBotUserIfMissing } from '@/hooks/createDefaultBotUser'

describe('createDefaultBotUserIfMissing', () => {
  it('creates a default bot user when none exists', async () => {
    const createBotUser = vi.fn(async () => undefined)

    const created = await createDefaultBotUserIfMissing({
      botUserExists: false,
      createBotUser,
      isBotUser: false,
    })

    expect(created).toBe(true)
    expect(createBotUser).toHaveBeenCalledTimes(1)
  })

  it('skips creation when the current user is already a bot', async () => {
    const createBotUser = vi.fn(async () => undefined)

    const created = await createDefaultBotUserIfMissing({
      botUserExists: false,
      createBotUser,
      isBotUser: true,
    })

    expect(created).toBe(false)
    expect(createBotUser).not.toHaveBeenCalled()
  })

  it('skips creation when a bot already exists', async () => {
    const createBotUser = vi.fn(async () => undefined)

    const created = await createDefaultBotUserIfMissing({
      botUserExists: true,
      createBotUser,
      isBotUser: false,
    })

    expect(created).toBe(false)
    expect(createBotUser).not.toHaveBeenCalled()
  })
})
