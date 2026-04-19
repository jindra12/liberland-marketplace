import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

type ReplyCountCollection = {
  updateOne: (filter: { _id: string }, update: { $inc: Record<string, number> }) => Promise<unknown>
}

type ReplyCountCollectionMap = Record<string, { collection?: ReplyCountCollection }>

type CommentDoc = {
  replyComment?: unknown
}

const toStringID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }

  return null
}

const getCommentsCollection = (req: PayloadRequest): ReplyCountCollection => {
  const collectionMap = req.payload.db.collections as unknown as ReplyCountCollectionMap
  const collection = collectionMap.comments?.collection

  if (!collection) {
    throw new Error('Missing raw collection for "comments".')
  }

  return collection
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

  await getCommentsCollection(req).updateOne(
    {
      _id: commentID,
    },
    {
      $inc: {
        replyCount: delta,
      },
    },
  )
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

export const updateCommentReplyCountAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
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
