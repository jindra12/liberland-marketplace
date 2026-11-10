import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

import { toStringID } from '@/utilities/toStringID'

type CommentDoc = {
  replyComment?: unknown
}

const updateReplyCount = async ({
  commentID,
  delta,
  req,
}: {
  commentID: string
  delta: number
  req: PayloadRequest
}): Promise<void> => {
  if (delta === 0) {
    return
  }

  await req.payload.db.updateOne({
    collection: 'comments', id: commentID, req,
    data: { replyCount: { $inc: delta } },
    returning: false,
  })
}

const getReplyCommentID = (doc: CommentDoc | undefined): string | null => {
  return toStringID(doc?.replyComment)
}

export const updateCommentReplyCountAfterChange: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const currentReplyCommentID = getReplyCommentID(doc as CommentDoc)
  const previousReplyCommentID = getReplyCommentID(previousDoc as CommentDoc | undefined)

  if (operation === 'create') {
    if (currentReplyCommentID) {
      await updateReplyCount({
        commentID: currentReplyCommentID,
        delta: 1,
        req,
      })
    }

    return doc
  }

  if (previousReplyCommentID && previousReplyCommentID !== currentReplyCommentID) {
    await updateReplyCount({
      commentID: previousReplyCommentID,
      delta: -1,
      req,
    })
  }

  if (currentReplyCommentID && previousReplyCommentID !== currentReplyCommentID) {
    await updateReplyCount({
      commentID: currentReplyCommentID,
      delta: 1,
      req,
    })
  }

  return doc
}

export const updateCommentReplyCountAfterDelete: CollectionAfterDeleteHook = async ({
  doc,
  req,
}) => {
  const replyCommentID = getReplyCommentID(doc as CommentDoc)

  if (replyCommentID) {
    await updateReplyCount({
      commentID: replyCommentID,
      delta: -1,
      req,
    })
  }

  return doc
}
