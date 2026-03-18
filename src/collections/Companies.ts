import { authenticated } from '@/access/authenticated'
import { completenessScoreField } from '@/fields/completenessScoreField'
import { markdownField } from '@/fields/markdownField'
import { notificationSubscriptionStatusField } from '@/fields/notificationSubscriptionStatusField'
import { serverURLField } from '@/fields/serverURLField'
import { cryptoAddressesField } from '@/fields/cryptoAddressesField'
import { publishedOrOwnDocsOrAdmin } from '@/access/publishedOrOwnDocsOrAdmin'
import { computeCompletenessScore } from '@/hooks/computeCompletenessScore'
import { requireVerifiedEmailToPublish } from '@/hooks/requireVerifiedEmailToPublish'
import { sendItemUpdateNotifications } from '@/hooks/sendItemUpdateNotifications'
import { sendRelatedItemPublishedNotifications } from '@/hooks/sendRelatedItemPublishedNotifications'
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
    afterChange: [
      sendItemUpdateNotifications('companies'),
      sendRelatedItemPublishedNotifications({
        childCollection: 'companies',
        getParentID: (doc) =>
          typeof doc.identity === 'string' ? doc.identity : doc.identity?.id ?? null,
        parentCollection: 'identities',
      }),
      updateIdentityItemCountAfterChange('identity'),
    ],
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
    serverURLField(),
    { name: 'name', type: 'text', required: true },
    { name: 'website', type: 'text' },
    { name: 'phone', type: 'text' },
    { name: 'email', type: 'email' },
    cryptoAddressesField(),
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
    notificationSubscriptionStatusField('companies'),
    completenessScoreField,
  ],
}
