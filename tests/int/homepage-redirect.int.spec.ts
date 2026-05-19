import { describe, expect, it, vi } from 'vitest'

const NSWAP_URL = 'https://nswap.io'

const mocks = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirectMock,
}))

import HomePage from '@/app/(frontend)/page'

describe('homepage redirect', () => {
  it('redirects to nswap.io', async () => {
    await expect(HomePage()).rejects.toThrow(`redirect:${NSWAP_URL}`)
    expect(mocks.redirectMock).toHaveBeenCalledWith(NSWAP_URL)
  })
})
