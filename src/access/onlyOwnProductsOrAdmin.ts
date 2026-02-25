import type { Access } from 'payload'

import type { User } from '@/payload-types'

export const onlyOwnProductsOrAdmin: Access = ({ req }) => {
  const { user } = req as { user?: Partial<User> | null }

  if (!user) return false
  if (user.role?.includes('admin')) return true

  return {
    'company.createdBy': {
      equals: user.id,
    },
  }
}
