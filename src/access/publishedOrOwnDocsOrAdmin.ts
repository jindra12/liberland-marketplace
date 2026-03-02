import type { Access, Where } from 'payload'
import type { User } from '@/payload-types'

const publishedOnly: Where = {
  _status: { equals: 'published' },
}

export const publishedOrOwnDocsOrAdmin: Access = ({ req: { user } }) => {
  // Unauthenticated: only published
  if (!user) {
    return publishedOnly
  }

  // Admin: everything
  if ((user as User).role?.includes('admin')) {
    return true
  }

  // Authenticated non-admin: published items + their own (any status)
  const ownOrPublished: Where = {
    or: [
      { _status: { equals: 'published' } },
      { createdBy: { equals: user.id } },
    ],
  }
  return ownOrPublished
}
