import { authenticated } from '@/access/authenticated'
import { completenessScoreField } from '@/fields/completenessScoreField'
import { markdownField } from '@/fields/markdownField'
import { notificationSubscriberCountField } from '@/fields/notificationSubscriberCountField'
import { notificationSubscriptionStatusField } from '@/fields/notificationSubscriptionStatusField'
import { serverURLField } from '@/fields/serverURLField'
import { publishedOrOwnDocsOrAdmin } from '@/access/publishedOrOwnDocsOrAdmin'
import { computeCompletenessScore } from '@/hooks/computeCompletenessScore'
import { requireOwnCompany } from '@/hooks/requireOwnCompany'
import { requireVerifiedEmailToPublish } from '@/hooks/requireVerifiedEmailToPublish'
import { sendRelatedItemPublishedNotifications } from '@/hooks/sendRelatedItemPublishedNotifications'
import { sendItemUpdateNotifications } from '@/hooks/sendItemUpdateNotifications'
import {
  updateIdentityItemCountAfterChange,
  updateIdentityItemCountAfterDelete,
} from '@/hooks/updateIdentityItemCount'
import { validateInvolvedUsers } from '@/hooks/validateInvolvedUsers'
import { joinStartup, leaveStartup } from '@/endpoints/involvedUsers'
import { onlyOwnDocsOrAdmin, onlyOwnDocsOrAdminFilter } from '@/access/onlyOwnDocsOrAdmin'
import { getCurrencies } from '@/utilities/getCurrencies'
import type { CollectionConfig } from 'payload'

const resourceOptions = [
  { label: 'Funding', value: 'funding' },
  { label: 'Founders', value: 'founders' },
  { label: 'Team', value: 'team' },
  { label: 'Traction', value: 'traction' },
  { label: 'Distribution', value: 'distribution' },
  { label: 'Production', value: 'production' },
  { label: 'Idea', value: 'idea' },
  { label: 'Product', value: 'product' },
]

export const Startups: CollectionConfig = {
  slug: 'startups',
  labels: {
    singular: 'Venture',
    plural: 'Ventures',
  },
  defaultSort: '-completenessScore',
  endpoints: [joinStartup, leaveStartup],
  hooks: {
    beforeChange: [
      requireOwnCompany,
      computeCompletenessScore([
        'description',
        'image',
        'fundsNeeded.amount',
        'lookingFor',
        'alreadyHave',
      ]),
      requireVerifiedEmailToPublish,
      validateInvolvedUsers,
    ],
    afterChange: [
      sendItemUpdateNotifications('startups'),
      sendRelatedItemPublishedNotifications({
        childCollection: 'startups',
        getParentID: (doc) =>
          typeof doc.company === 'string' ? doc.company : doc.company?.id ?? null,
        parentCollection: 'companies',
      }),
      updateIdentityItemCountAfterChange('identity'),
    ],
    afterDelete: [updateIdentityItemCountAfterDelete('identity')],
  },
  versions: {
    drafts: true,
  },
  admin: {
    useAsTitle: 'title',
    group: 'Directory',
    defaultColumns: ['title', 'company', 'stage', 'fundsNeeded', '_status'],
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
    { name: 'title', type: 'text', required: true },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
      filterOptions: ({ user }) => {
        if (!user) return true // Local API calls (internal operations)
        return onlyOwnDocsOrAdminFilter({ user })
      },
    },
    markdownField({
      name: 'description',
      label: 'Description',
    }),
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
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
      name: 'fundsNeeded',
      label: 'Amount of Funds Needed',
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'amount', type: 'number', min: 0 },
            {
              name: 'currency',
              type: 'select',
              defaultValue: 'USD',
              options: getCurrencies(),
            },
          ],
        },
      ],
    },
    {
      name: 'lookingFor',
      label: 'Looking For',
      type: 'select',
      hasMany: true,
      options: resourceOptions,
    },
    {
      name: 'alreadyHave',
      label: 'Already Have',
      type: 'select',
      hasMany: true,
      options: resourceOptions,
    },
    {
      name: 'stage',
      label: 'Stage',
      type: 'select',
      required: true,
      defaultValue: 'idea',
      options: [
        { label: 'Idea', value: 'idea' },
        { label: 'Early', value: 'early' },
        { label: 'MVP', value: 'mvp' },
        { label: 'Established', value: 'established' },
        { label: 'Scaling', value: 'scaling' },
      ],
    },
    {
      name: 'involvedUsers',
      label: 'Involved Users',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
    },
    notificationSubscriberCountField(),
    notificationSubscriptionStatusField('startups'),
    completenessScoreField,
  ],
}
