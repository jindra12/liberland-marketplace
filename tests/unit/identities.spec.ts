import { describe, expect, it, vi } from 'vitest'

import { Identities } from '@/collections/Identities'

type IdentityBeforeOperationHook = NonNullable<NonNullable<typeof Identities.hooks>['beforeOperation']>[number]
type IdentityBeforeOperationArgs = Parameters<IdentityBeforeOperationHook>[0]
type IdentityFindByIDBeforeOperationArgs = Extract<IdentityBeforeOperationArgs, { operation: 'findByID' }>

describe('Identities collection', () => {
  it('falls back to the raw Mongo _id when findByID resolves a legacy identity', async () => {
    const beforeOperation = Identities.hooks?.beforeOperation?.[0]

    if (!beforeOperation) {
      throw new Error('Expected a beforeOperation hook on Identities.')
    }

    const findOne = vi.fn(async () => ({
      _id: {
        toHexString: () => '69a5d8051fa4248965364bed',
      },
      name: 'Radical Longevity',
    }))

    const req = {
      payload: {
        db: {
          collections: {
            identities: {
              collection: {
                findOne,
              },
            },
          },
        },
      },
    } as unknown as IdentityFindByIDBeforeOperationArgs['req']

    const operationArgs: IdentityFindByIDBeforeOperationArgs = {
      args: {
        id: '69a5d8051fa4248965364bed',
      } as IdentityFindByIDBeforeOperationArgs['args'],
      operation: 'findByID',
      collection: {} as IdentityFindByIDBeforeOperationArgs['collection'],
      context: {} as IdentityFindByIDBeforeOperationArgs['context'],
      req,
    }

    const nextArgs = await beforeOperation(operationArgs)

    expect(findOne).toHaveBeenCalledWith({
      _id: expect.any(Object),
    })
    expect(nextArgs).toBeUndefined()
    expect(operationArgs.args.data).toMatchObject({
      id: '69a5d8051fa4248965364bed',
      name: 'Radical Longevity',
    })
  })

  it('keeps the explicit Tribe ID field on create', () => {
    const tribeIdField = Identities.fields.find((field) => (field as { name?: string }).name === 'id')

    if (!tribeIdField || tribeIdField.type !== 'text') {
      throw new Error('Expected the Tribe ID field to remain a text field.')
    }

    expect(tribeIdField.required).toBe(true)
    expect(tribeIdField.unique).toBe(true)
  })
})
