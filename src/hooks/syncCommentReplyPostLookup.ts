import type { CollectionBeforeChangeHook } from 'payload'

type ReplyPostRelation = {
  relationTo?: unknown
  value?: unknown
}

const toStringId = (value: unknown): null | string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)

  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id

    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }

  return null
}

export const syncCommentReplyPostLookup: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const next = { ...(data ?? {}) }
  const replyPost = (next.replyPost ?? originalDoc?.replyPost) as ReplyPostRelation | undefined

  next.replyPostRelationTo = typeof replyPost?.relationTo === 'string' ? replyPost.relationTo : null
  next.replyPostValue = toStringId(replyPost?.value)

  return next
}
