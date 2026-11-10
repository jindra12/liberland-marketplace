import { describe, expect, it } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import { graphql } from 'graphql'
import type { PayloadRequest } from 'payload'
import type { Startup, User } from '@/payload-types'
import { createMembershipSchema } from './membership/utils'

describe('Venture membership boundaries', () => {
  it.each(['joinStartup', 'leaveStartup'])(
    '%s cannot read or mutate a venture hidden from the caller',
    async (operation) => {
      const req = mockDeep<PayloadRequest>()
      req.user = mock<User & { collection: 'users' }>({
        id: 'mallory',
        role: ['user'],
        collection: 'users',
      })
      const venture = Object.assign(mock<Startup>(), {
        id: 'private',
        name: 'Confidential venture',
        involvedUsers: operation === 'leaveStartup' ? ['mallory'] : [],
      })
      req.payload.findByID.mockImplementation(async (options) => {
        if (!options.overrideAccess) {
          throw new Error('This venture is not readable by the caller')
        }
        return venture
      })
      req.payload.update.mockResolvedValue(venture)
      const result = await graphql({
        schema: createMembershipSchema(),
        source: `mutation { ${operation}(id: "private") { startup { id name } } }`,
        contextValue: { req },
      })
      expect({
        denied: Boolean(result.errors),
        writes: req.payload.update.mock.calls.length,
      }).toEqual({ denied: true, writes: 0 })
    },
  )
})
