import type { Access } from 'payload'

export const onlyOwnProductsOrAdmin: Access = ({ req }) => {
  const { user } = req

  if (!user) return false
  if (user.role?.includes('admin')) return true
  if (!user.id) return false

  return {
    'company.createdBy': {
      equals: user.id,
    },
  }
}
