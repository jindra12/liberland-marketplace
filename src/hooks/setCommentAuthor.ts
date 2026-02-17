import { createHash } from 'node:crypto'
import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

const getRequestIP = (req: PayloadRequest): string => {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const real = req.headers.get('x-real-ip')?.trim()
  const direct = (req as PayloadRequest & { ip?: string }).ip

  return forwarded || real || direct || 'unknown'
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
