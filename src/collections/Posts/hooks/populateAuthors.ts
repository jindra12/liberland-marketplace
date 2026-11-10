import { APIError, type CollectionAfterReadHook } from 'payload'
import type { Post } from '@/payload-types'
import { toStringID } from '@/utilities/toStringID'

export const populateAuthors: CollectionAfterReadHook<Post> = async ({ doc, req }) => {
  const authors = await Promise.all(
    (doc.authors || []).map(async (author) => {
      const id = toStringID(author)
      if (!id) {
        return null
      }
      try {
        const result = await req.payloadDataLoader.find({
          collection: 'users',
          where: { id: { equals: id } },
          limit: 1,
          depth: 0,
          overrideAccess: false,
          req,
          select: { name: true },
        })
        const authorDoc = result.docs[0]
        return authorDoc ? { id: authorDoc.id, name: authorDoc.name } : null
      } catch (error) {
        // Inaccessible authors must not leak through a public post.
        if (error instanceof APIError && (error.status === 403 || error.status === 404)) {
          return null
        }
        throw error
      }
    }),
  )
  doc.populatedAuthors = authors.filter((author) => author !== null)
  return doc
}
