import type { Access } from 'payload'

export const adminOrSelf: Access = ({ req }) => {
  const { user } = req

  if (!user) return false
  if (user.role?.includes('admin')) return true

  return {
    id: {
      equals: user.id,
    },
  }
}
