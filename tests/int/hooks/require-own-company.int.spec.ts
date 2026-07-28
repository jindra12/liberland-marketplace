import { describe, expect, it, vi } from 'vitest'

import { requireOwnCompany } from '@/hooks/requireOwnCompany'

type FindArgs = {
  collection: 'companies'
  depth: 0
  limit: 1
  overrideAccess: false
  req: never
  where: {
    and: Array<
      | {
          createdBy: {
            equals: string
          }
        }
      | {
          id: {
            equals: string
          }
        }
    >
  }
}

const createReq = (totalDocs: number) =>
  ({
    payload: {
      find: vi.fn(async (_args: FindArgs) => ({
        totalDocs,
      })),
    },
  }) as never

describe('requireOwnCompany', () => {
  it('allows a post author to attach a company they own', async () => {
    const req = createReq(1)
    const data = {
      company: 'company_1',
      authors: ['user_1'],
    }

    const result = await requireOwnCompany({
      data,
      operation: 'create',
      req,
    } as never)

    expect(result).toBe(data)
    expect((req as { payload: { find: ReturnType<typeof vi.fn> } }).payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'companies',
        overrideAccess: false,
        where: {
          and: [
            { id: { equals: 'company_1' } },
            { createdBy: { equals: 'user_1' } },
          ],
        },
      }),
    )
  })

  it('allows a comment author to keep a company they own on update', async () => {
    const req = createReq(1)
    const data = {
      company: 'company_2',
    }

    const result = await requireOwnCompany({
      data,
      operation: 'update',
      originalDoc: {
        company: 'company_1',
        createdBy: 'user_2',
      },
      req,
    } as never)

    expect(result).toBe(data)
    expect((req as { payload: { find: ReturnType<typeof vi.fn> } }).payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          and: [
            { id: { equals: 'company_2' } },
            { createdBy: { equals: 'user_2' } },
          ],
        },
      }),
    )
  })

  it('rejects attaching a company that belongs to a different author', async () => {
    const req = createReq(0)

    await expect(
      requireOwnCompany({
        data: {
          company: 'company_3',
          authors: ['user_3'],
        },
        operation: 'create',
        req,
      } as never),
    ).rejects.toThrow('You can only attach records to companies you own.')
  })
})
