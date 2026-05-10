import commentsPluginImport from 'payload-plugin-comments'
import type { CollectionConfig, Config, Field, Plugin } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { markdownField } from '@/fields/markdownField'
import { requireOwnCompany } from '@/hooks/requireOwnCompany'
import { requireVerifiedEmailToCreate } from '@/hooks/requireVerifiedEmail'
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin'
import { onlyOwnDocsOrAdminFilter } from '@/access/onlyOwnDocsOrAdmin'
import { computeContentRanking } from '@/hooks/computeContentRanking'
import { setCommentServerUrl } from '@/hooks/setCommentServerUrl'
import {
  updateCommentReplyCountAfterChange,
  updateCommentReplyCountAfterDelete,
} from '@/hooks/updateCommentReplyCount'

type CommentsPluginFactory = (options?: Record<string, unknown>) => Plugin

const commentsPlugin = (
  typeof commentsPluginImport === 'function'
    ? commentsPluginImport
    : (commentsPluginImport as unknown as { default: CommentsPluginFactory }).default
) as CommentsPluginFactory

const commentTargets = ['jobs', 'companies', 'posts', 'products', 'identities', 'startups'] as const

const baseComments = commentsPlugin({
  slug: 'comments',
  fields: [
    { ...markdownField({ name: 'content', label: 'Content' }), required: true },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      index: true,
      required: true,
      filterOptions: onlyOwnDocsOrAdminFilter,
    },
    { name: 'replyPost', type: 'relationship', relationTo: [...commentTargets], required: true },
    { name: 'replyComment', type: 'relationship', relationTo: 'comments' },
    {
      name: 'replyCount',
      type: 'number',
      defaultValue: 0,
      access: {
        update: () => false,
      },
      admin: {
        readOnly: true,
      },
    },
    { name: 'serverUrl', type: 'text', admin: { hidden: true, readOnly: true } },
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
  hasPublishedCommentFields: [],
})

export const comments: Plugin = (config: Config): Config => {
  const withComments = baseComments(config) as Config

  return {
    ...withComments,
    collections: (withComments.collections ?? []).map((collection: CollectionConfig) => {
      if (collection.slug !== 'comments') return collection

      return {
        ...collection,
        defaultSort: '-contentRankScore',
        access: {
          ...collection.access,
          create: authenticated,
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
            setCommentServerUrl,
            requireOwnCompany,
            requireVerifiedEmailToCreate,
            computeContentRanking({
              fieldPaths: ['content', 'replyPost', 'replyComment'],
              includeSubscriberCount: false,
            }),
            ...(collection.hooks?.beforeChange ?? []),
          ],
          afterChange: [
            updateCommentReplyCountAfterChange,
            ...(collection.hooks?.afterChange ?? []),
          ],
          afterDelete: [
            updateCommentReplyCountAfterDelete,
            ...(collection.hooks?.afterDelete ?? []),
          ],
        },
      }
    }),
  }
}
