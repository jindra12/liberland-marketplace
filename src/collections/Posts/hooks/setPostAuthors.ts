import type { CollectionBeforeChangeHook } from 'payload'
import type { Post } from '@/payload-types'
import { isAdminUser } from '@/access/admin'

export const setPostAuthors: CollectionBeforeChangeHook<Post> = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!req.user || isAdminUser(req.user)) {
    return data
  }
  return {
    ...data,
    authors: operation === 'create' ? [req.user.id] : originalDoc?.authors,
  }
}
