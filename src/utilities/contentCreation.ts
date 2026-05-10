import type { AccessUser } from '@/access/types'
import { isAdminUser } from '@/access/admin'

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
