import type { Access } from 'payload'

import type { AccessUser } from './types'
import { isNonAdminContentCreationBlocked } from '@/utilities/contentCreation'

const isAdminUser = (user: AccessUser): boolean =>
  user?.role?.includes('admin') || false

const hasPrivateFlag = (
  data: unknown,
): data is {
  isPrivate?: boolean
} => typeof data === 'object' && data !== null && !Array.isArray(data) && 'isPrivate' in data

export const authenticatedCanCreateCompany: Access = ({ data, req }) => {
  if (!req.user) {
    return false
  }

  if (isAdminUser(req.user)) {
    return true
  }

  if (!isNonAdminContentCreationBlocked()) {
    return true
  }

  return hasPrivateFlag(data) && data.isPrivate === true
}
