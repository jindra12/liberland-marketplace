import type { Access } from 'payload'

import type { AccessUser } from './types'

export const onlyOwnDocsOrAdmin: Access = ({ req }) => onlyOwnDocsOrAdminFilter({ user: req.user })

export const onlyOwnDocsOrAdminFilter = ({ user }: { user?: AccessUser }) => {
  if (!user?.id) {
    return false
  }

  if (user.role?.includes('admin')) {
    return true
  }

  return {
    createdBy: { equals: user.id },
  }
}
