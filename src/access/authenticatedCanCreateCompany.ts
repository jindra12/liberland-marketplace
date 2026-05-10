import type { Access } from 'payload'

import { isAdminUser } from './admin'
import { isNonAdminContentCreationBlocked } from '@/utilities/contentCreation'

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
