import type { Access } from 'payload'
import type { Where } from 'payload'

import type { AccessUser } from './types'

export const onlyOwnProductsOrAdmin: Access = ({ req }): boolean | Where => {
  const { user } = req

  if (!user) return false
  if (user.role?.includes('admin')) return true
  if (!user.id) return false

  return {
    or: [
      { 'company.createdBy': { equals: user.id } },
      {
        and: [
          { createdBy: { equals: user.id } },
          { _status: { equals: 'draft' } },
          { company: { exists: false } },
        ],
      },
    ],
  }
}

export const onlyOwnProductsOrAdminFilter = ({ user }: { user?: AccessUser }): boolean | Where => {
  if (!user?.id) {
    return false
  }

  if (user.role?.includes('admin')) {
    return true
  }

  return {
    createdBy: {
      equals: user.id,
    },
  }
}
