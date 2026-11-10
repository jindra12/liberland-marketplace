import type { Access } from 'payload'
import { isAdminUser } from './admin'

export const authenticatedOrPublished: Access = ({ req: { user } }) => {
  if (isAdminUser(user)) {
    return true
  }

  const published = {
    _status: {
      equals: 'published',
    },
  }
  return user ? { or: [published, { createdBy: { equals: user.id } }] } : published
}
