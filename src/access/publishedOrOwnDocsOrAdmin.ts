import type { Access, Where } from 'payload'

const publishedOnly: Where = {
  _status: { equals: 'published' },
}

export const publishedOrOwnDocsOrAdmin: Access = ({ req: { user } }) => {
  // Unauthenticated: only published
  if (!user) {
    return publishedOnly
  }

  // Admin: everything
  if (user.role?.includes('admin')) {
    return true
  }

  // Authenticated non-admin: published items + their own (any status)
  if (!user.id) {
    return publishedOnly
  }

  const ownOrPublished: Where = {
    or: [
      { _status: { equals: 'published' } },
      { createdBy: { equals: user.id } },
    ],
  }
  return ownOrPublished
}
