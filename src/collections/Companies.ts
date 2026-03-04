import { authenticated } from '@/access/authenticated'
import { completenessScoreField } from '@/fields/completenessScoreField'
import { markdownField } from '@/fields/markdownField'
import { publishedOrOwnDocsOrAdmin } from '@/access/publishedOrOwnDocsOrAdmin'
import { computeCompletenessScore } from '@/hooks/computeCompletenessScore'
import { requireVerifiedEmailToPublish } from '@/hooks/requireVerifiedEmailToPublish'
import {
  updateIdentityItemCountAfterChange,
  updateIdentityItemCountAfterDelete,
} from '@/hooks/updateIdentityItemCount'
import { onlyOwnDocsOrAdmin, onlyOwnDocsOrAdminFilter } from '@/access/onlyOwnDocsOrAdmin'
import type { CollectionConfig } from 'payload'

export const Companies: CollectionConfig = {
  slug: 'companies',
  defaultSort: '-completenessScore',
  hooks: {
    beforeChange: [
      computeCompletenessScore(['website', 'phone', 'email', 'image', 'description']),
      requireVerifiedEmailToPublish,
    ],
    afterChange: [updateIdentityItemCountAfterChange('identity')],
    afterDelete: [updateIdentityItemCountAfterDelete('identity')],
  },
  versions: {
    drafts: true,
  },
  admin: {
    useAsTitle: 'name',
    group: 'Directory',
    defaultColumns: ['name', 'website', 'phone', 'email', '_status'],
    components: {
      edit: {
        PublishButton: '@/components/VerifiedPublishButton',
      },
    },
    baseFilter: ({ req }) => {
      const filter = onlyOwnDocsOrAdminFilter({ user: req.user })
      return typeof filter === 'object' ? filter : null
    },
  },
  access: {
    create: authenticated,
    delete: onlyOwnDocsOrAdmin,
    read: publishedOrOwnDocsOrAdmin,
    update: onlyOwnDocsOrAdmin,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'website', type: 'text' },
    { name: 'phone', type: 'text' },
    { name: 'email', type: 'email' },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
    },
    markdownField({
      name: 'description',
      label: 'Description',
    }),
    {
      name: 'identity',
      label: 'Tribe',
      type: 'relationship',
      relationTo: 'identities',
      required: true,
      admin: {
        allowCreate: true,
        allowEdit: true,
      },
    },
    {
      name: 'allowedIdentities',
      label: 'Allowed tribes',
      type: 'relationship',
      relationTo: 'identities',
      hasMany: true,
      index: true,
      admin: {
        allowCreate: true,
        allowEdit: true,
      },
    },
    {
      name: 'disallowedIdentities',
      label: 'Disallowed tribes',
      type: 'relationship',
      relationTo: 'identities',
      hasMany: true,
      index: true,
      admin: {
        allowCreate: true,
        allowEdit: true,
      },
    },
    completenessScoreField,
  ],
}
