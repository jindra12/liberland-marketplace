import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockDeep } from 'vitest-mock-extended'
import { up } from '@/migrations/20260627_103000_create_default_bot_user'

describe('Bot migration credential preconditions', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reports a missing model credential before making any database mutation', async () => {
    vi.stubEnv('CHATGPT_KEY', '')
    const args = mockDeep<Parameters<typeof up>[0]>()
    await expect(up(args)).rejects.toThrow('CHATGPT_KEY must be set')
    expect(args.payload.db.create).not.toHaveBeenCalled()
    expect(args.payload.db.delete).not.toHaveBeenCalled()
  })

  it('does not create another bot when an existing bot is found', async () => {
    vi.stubEnv('CHATGPT_KEY', 'fixture-key-never-sent')
    const args = mockDeep<Parameters<typeof up>[0]>()
    args.payload.find.mockResolvedValue({ docs: [{ id: 'existing-bot' }], totalDocs: 1 })
    await up(args)
    expect(args.payload.db.create).not.toHaveBeenCalled()
  })
})
