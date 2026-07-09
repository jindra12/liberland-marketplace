import { describe, expect, it } from 'vitest'

import { sanitizeUserCreateData } from '@/collections/Users/utils'

describe('Users create sanitization', () => {
  it('sanitizes non-admin user creation payloads', () => {
    const result = sanitizeUserCreateData({
      data: {
        bot: true,
        role: ['admin'],
      },
      existingUserCount: 1,
      isAdmin: false,
    })

    expect(result?.bot).toBe(false)
    expect(result?.role).toEqual(['user'])
  })

  it('bootstraps the first user as admin while keeping verification off', () => {
    const result = sanitizeUserCreateData({
      data: {
      },
      existingUserCount: 0,
      isAdmin: false,
    })

    expect(result?.bot).toBe(false)
    expect(result?.role).toEqual(['admin'])
  })
})
