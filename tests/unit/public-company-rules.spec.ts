import { describe, expect, it, vi } from 'vitest'

import { shouldCreateDefaultCompanyBePrivate } from '@/hooks/createDefaultCompany'
import { userHasPublicCompany } from '@/access/publicCompanyAccess'

type PublicCompanyFindArgs = {
  collection: 'companies'
  depth: 0
  limit: 1
  overrideAccess: true
  where: {
        and: Array<
          | {
              createdBy: {
                equals: string | number
              }
            }
      | {
          isPrivate: {
            equals: false
          }
        }
    >
  }
}

const createAccessReq = (totalDocs: number, userId?: string, role?: string[]) => {
  const req = {
    payload: {
      find: vi.fn(async (_args: PublicCompanyFindArgs) => ({
        totalDocs,
      })),
      findByID: vi.fn(async (_args: {
        collection: 'companies'
        depth: 0
        id: string
        overrideAccess: true
        req?: unknown
      }) => ({
        id: _args.id,
        isPrivate: false,
      })),
    },
    user:
      userId || role
        ? {
            id: userId,
            role,
          }
        : undefined,
  }

  return req
}

describe('public company rules', () => {
  it('marks non-admin default companies private only when the block flag is active', () => {
    expect(
      shouldCreateDefaultCompanyBePrivate({
        blockNonAdminContentCreation: true,
        user: { role: ['user'] },
      }),
    ).toBe(true)

    expect(
      shouldCreateDefaultCompanyBePrivate({
        blockNonAdminContentCreation: true,
        user: { role: ['admin'] },
      }),
    ).toBe(false)

    expect(
      shouldCreateDefaultCompanyBePrivate({
        blockNonAdminContentCreation: false,
        user: { role: ['user'] },
      }),
    ).toBe(false)
  })

  it('short-circuits public company checks when the block flag is inactive', async () => {
    vi.stubEnv('BLOCK_NON_ADMIN_CONTENT_CREATION', 'false')

    const req = createAccessReq(0, 'user-1', ['user'])

    await expect(userHasPublicCompany({ req })).resolves.toBe(true)
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('reports whether a user has at least one public company when blocking is active', async () => {
    vi.stubEnv('BLOCK_NON_ADMIN_CONTENT_CREATION', 'true')

    const reqWithPublicCompany = createAccessReq(1, 'user-1', ['user'])

    await expect(userHasPublicCompany({ req: reqWithPublicCompany })).resolves.toBe(true)
    expect(reqWithPublicCompany.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          and: [
            { createdBy: { equals: 'user-1' } },
            { isPrivate: { equals: false } },
          ],
        },
      }),
    )

    const reqWithOnlyPrivateCompanies = createAccessReq(0, 'user-2', ['user'])
    await expect(userHasPublicCompany({ req: reqWithOnlyPrivateCompanies })).resolves.toBe(false)

    const adminReq = createAccessReq(0, 'admin-1', ['admin'])
    await expect(userHasPublicCompany({ req: adminReq })).resolves.toBe(true)
    expect(adminReq.payload.find).not.toHaveBeenCalled()
  })
})
