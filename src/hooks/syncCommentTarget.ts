import type { CollectionBeforeChangeHook } from 'payload'
import type { Comment } from '@/payload-types'
import { toStringID } from '@/utilities/toStringID'

export const syncCommentTarget: CollectionBeforeChangeHook<Comment> = ({ data, originalDoc }) => {
  const target = data.replyPost ?? originalDoc?.replyPost
  return {
    ...data,
    replyPostRelationTo: target?.relationTo,
    replyPostValue: toStringID(target?.value),
  }
}
