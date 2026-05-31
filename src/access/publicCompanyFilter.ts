import type { Where } from 'payload'

import type { AccessUser } from './types'

const publicCompanyWhere: Where = {
  isPrivate: {
    equals: false,
  },
}

export const publicCompanyFilter = ({ user }: { user?: AccessUser }): Where => {
  if (!user?.id) {
    return publicCompanyWhere
  }

  if (user.role?.includes('admin')) {
    return publicCompanyWhere
  }

  return {
    and: [
      publicCompanyWhere,
      {
        createdBy: {
          equals: user.id,
        },
      },
    ],
  }
}
