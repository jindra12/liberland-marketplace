import commentsPluginImport from 'payload-plugin-comments'
import type { CollectionConfig, Config, Field, Plugin } from 'payload'

import { anyone } from '@/access/anyone'
import { markdownField } from '@/fields/markdownField'
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin'
import { setCommentAuthor } from '@/hooks/setCommentAuthor'
import { syncCommentReplyPostLookup } from '@/hooks/syncCommentReplyPostLookup'

type CommentsPluginFactory = (options?: Record<string, unknown>) => Plugin

const commentsPlugin = (
  typeof commentsPluginImport === 'function'
    ? commentsPluginImport
    : (commentsPluginImport as unknown as { default: CommentsPluginFactory }).default
) as CommentsPluginFactory

const commentTargets = ['jobs', 'companies', 'products', 'identities', 'startups'] as const

const baseComments = commentsPlugin({
  slug: 'comments',
  fields: [
    { ...markdownField({ name: 'content', label: 'Content' }), required: true },
    { name: 'replyPost', type: 'relationship', relationTo: [...commentTargets], required: true },
    { name: 'replyComment', type: 'relationship', relationTo: 'comments' },
    { name: 'anonymousHash', type: 'text', admin: { hidden: true, readOnly: true } },
    {
      name: 'replyPostRelationTo',
      type: 'text',
      index: true,
      admin: { hidden: true, readOnly: true },
    },
    {
      name: 'replyPostValue',
      type: 'text',
      index: true,
      admin: { hidden: true, readOnly: true },
    },
  ],
  collectionsAllowingComments: [...commentTargets],
  autoPublish: true,
  hasPublishedCommentFields: ['anonymousHash'],
})

export const comments: Plugin = async (config: Config): Promise<Config> => {
  const withComments = await baseComments(config)

  return {
    ...withComments,
    collections: (withComments.collections ?? []).map((collection: CollectionConfig) => {
      if (collection.slug !== 'comments') return collection

      return {
        ...collection,
        access: {
          ...collection.access,
          create: anyone,
          read: anyone,
          update: onlyOwnDocsOrAdmin,
          delete: onlyOwnDocsOrAdmin,
        },
        fields: (collection.fields ?? []).filter(
          (field: Field) =>
            !(
              typeof field === 'object' &&
              field !== null &&
              'name' in field &&
              field.name === 'isApproved'
            ),
        ),
        hooks: {
          ...collection.hooks,
          beforeChange: [
            setCommentAuthor,
            syncCommentReplyPostLookup,
            ...(collection.hooks?.beforeChange ?? []),
          ],
        },
      }
    }),
  }
}
