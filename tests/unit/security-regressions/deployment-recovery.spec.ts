import { describe, expect, it } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { PayloadRequest } from 'payload'
import type { Startup, User } from '@/payload-types'
import {
  authorizeVentureRecovery,
  mergeRecoveryRecord,
  recoveryRecordSchema,
} from '@/venture/recoveryUtils'

describe('Deployment journal integrity', () => {
  it('rejects a second deployment runner even when it loaded a valid journal before the first wallet broadcast', () => {
    const record = recoveryRecordSchema.parse({
      values: {
        tokenName: 'Fixture',
        tokenSymbol: 'FIX',
        initialSupply: '21000000',
        tokensPerEth: '100',
        deploymentNetwork: 'ethereum',
        acknowledged: true,
      },
      transactions: [],
      progress: [],
      manifest: null,
    })
    const owner = { ...record, runnerId: 'a21533e9-8195-43e8-9f87-1d6f77ddac1c' }
    const contender = { ...record, runnerId: '44593b1b-268c-40c0-af2f-e7ec056236bb' }
    expect(() => mergeRecoveryRecord(owner, contender)).toThrow('another deployment runner')
    expect(mergeRecoveryRecord(owner, owner)).toMatchObject({ runnerId: owner.runnerId })
  })
  it('allows administrators to address the same recovery journal as its actual owner', async () => {
    const req = mockDeep<PayloadRequest>()
    req.query = { walletAddress: '0x1111111111111111111111111111111111111111' }
    req.routeParams = { id: 'venture' }
    req.payload.findByID.mockResolvedValue(mock<Startup>({ id: 'venture', createdBy: 'owner' }))
    req.user = mock<User & { collection: 'users' }>({
      id: 'owner',
      role: ['user'],
      collection: 'users',
    })
    const ownerKey = await authorizeVentureRecovery(req)
    req.user = mock<User & { collection: 'users' }>({
      id: 'administrator',
      role: ['admin'],
      collection: 'users',
    })
    expect(await authorizeVentureRecovery(req)).toBe(ownerKey)
  })
})
