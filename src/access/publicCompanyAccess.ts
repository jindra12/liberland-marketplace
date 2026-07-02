import type { Access } from 'payload'

import type { AccessUser } from './types'

type PublicCompanyCountResult = {
  totalDocs: number
}

const hasAdminRole = (user?: AccessUser): boolean => user?.role?.includes('admin') || false

export const userHasPublicCompany = async ({
  req,
}: {
  req: {
    payload: {
      find: (args: {
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
      }) => Promise<PublicCompanyCountResult>
    }
    user?: AccessUser | null
  }
}): Promise<boolean> => {
  const user = req.user

  if (!user?.id) {
    return false
  }

  if (hasAdminRole(user)) {
    return true
  }

  if (process.env.BLOCK_NON_ADMIN_CONTENT_CREATION !== 'true') {
    return true
  }

  const { totalDocs } = await req.payload.find({
    collection: 'companies',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        {
          createdBy: {
            equals: user.id,
          },
        },
        {
          isPrivate: {
            equals: false,
          },
        },
      ],
    },
  })

  return totalDocs > 0
}

export const canCreateContentWithPublicCompany: Access = async ({ req }) =>
  userHasPublicCompany({ req })
