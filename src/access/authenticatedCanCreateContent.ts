import type { Access } from 'payload'

import { canCreateContent } from '@/utilities/contentCreation'

export const authenticatedCanCreateContent: Access = ({ req }) => {
  if (!req.user) {
    return false
  }

  return canCreateContent(req.user)
}
