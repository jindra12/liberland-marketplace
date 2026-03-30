import { createHash } from 'node:crypto'
import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

type RequestWithIP = PayloadRequest & {
  ip?: string
}

const getRequestIP = (req: PayloadRequest): string => {
  return (req as RequestWithIP).ip || 'unknown'
}

export const setCommentAuthor: CollectionBeforeChangeHook = ({ data, req, operation, originalDoc }) => {
  const next = { ...(data ?? {}) }

  if (operation === 'update' && originalDoc) {
    next.replyPost = originalDoc.replyPost
    next.replyComment = originalDoc.replyComment
    next.anonymousHash = originalDoc.anonymousHash
    return next
  }

  if (req.user?.id) {
    next.anonymousHash = null
    return next
  }

  const salt = process.env.COMMENTS_HASH_SALT || process.env.PAYLOAD_SECRET || ''
  next.anonymousHash = createHash('sha256').update(`${salt}:${getRequestIP(req)}`).digest('hex')

  return next
}
