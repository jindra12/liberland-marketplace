import type { AccessUser } from '@/access/types'

const isAdminUser = (user: AccessUser): boolean => user?.role?.includes('admin') || false

export const isNonAdminContentCreationBlocked = (): boolean =>
  process.env.BLOCK_NON_ADMIN_CONTENT_CREATION === 'true'

export const canCreateContent = (user: AccessUser): boolean => {
  if (!user) {
    return false
  }

  if (isAdminUser(user)) {
    return true
  }

  return !isNonAdminContentCreationBlocked();
}
