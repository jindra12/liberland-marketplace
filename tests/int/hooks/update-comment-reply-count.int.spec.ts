import { describe, expect, it, vi } from 'vitest'

import {
  updateCommentReplyCountAfterChange,
  updateCommentReplyCountAfterDelete,
} from '@/hooks/updateCommentReplyCount'

const createReq = () => {
  const updateOne = vi.fn(async () => ({}))

  return {
    payload: {
      db: {
        collections: {
          comments: {
            collection: {
              updateOne,
            },
          },
        },
      },
    },
    updateOne,
  }
}

describe('updateCommentReplyCount', () => {
  it('increments the parent replyCount when a reply is created', async () => {
    const req = createReq()

    await updateCommentReplyCountAfterChange({
      doc: {
        id: 'comment_2',
        replyComment: 'comment_1',
      },
      operation: 'create',
      req: req as never,
    } as never)

    expect(req.updateOne).toHaveBeenCalledWith({
      _id: 'comment_1',
    }, {
      $inc: {
        replyCount: 1,
      },
    })
  })

  it('moves replyCount from the old parent to the new parent on update and decrements on delete', async () => {
    const req = createReq()

    await updateCommentReplyCountAfterChange({
      doc: {
        id: 'comment_2',
        replyComment: 'comment_3',
      },
      operation: 'update',
      previousDoc: {
        id: 'comment_2',
        replyComment: 'comment_1',
      },
      req: req as never,
    } as never)

    await updateCommentReplyCountAfterDelete({
      doc: {
        id: 'comment_2',
        replyComment: 'comment_3',
      },
      req: req as never,
    } as never)

    expect(req.updateOne).toHaveBeenNthCalledWith(
      1,
      {
        _id: 'comment_1',
      },
      {
        $inc: {
          replyCount: -1,
        },
      },
    )
    expect(req.updateOne).toHaveBeenNthCalledWith(
      2,
      {
        _id: 'comment_3',
      },
      {
        $inc: {
          replyCount: 1,
        },
      },
    )
    expect(req.updateOne).toHaveBeenNthCalledWith(
      3,
      {
        _id: 'comment_3',
      },
      {
        $inc: {
          replyCount: -1,
        },
      },
    )
  })
})
