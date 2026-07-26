import { computeContentRanking } from '@/hooks/computeContentRanking'
import { canCreateContentWithPublicCompany } from '@/access/publicCompanyAccess'
import { onlyOwnDocsOrAdminFilter } from '@/access/onlyOwnDocsOrAdmin'
import { completenessScoreField } from '@/fields/completenessScoreField'
import { createdByField } from '@/fields/createdByField'
import { TEXT_INPUT_MAX_LENGTH } from '@/fields/constants'
import { publicCompanyFilter } from '@/access/publicCompanyFilter'
import { markdownField } from '@/fields/markdownField'
import { notificationSubscriberCountField } from '@/fields/notificationSubscriberCountField'
import { notificationSubscriptionStatusField } from '@/fields/notificationSubscriptionStatusField'
import { serverURLField } from '@/fields/serverURLField'
import { publishedOrOwnDocsOrAdmin } from '@/access/publishedOrOwnDocsOrAdmin'
import { requireOwnCompany } from '@/hooks/requireOwnCompany'
import { requireVerifiedEmailToPublish } from '@/hooks/requireVerifiedEmailToPublish'
import {
  lazySendItemUpdateNotifications,
  lazySendRelatedItemPublishedNotifications,
  lazyUpdateIdentityItemCountAfterChange,
  lazyUpdateIdentityItemCountAfterDelete,
} from '@/hooks/lazyCollectionHooks'
import { validateInvolvedUsers } from '@/hooks/validateInvolvedUsers'
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin'
import { requirePublicCompany } from '@/hooks/requirePublicCompany'
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
  defaultSort: '-contentRankScore',
  hooks: {
    beforeChange: [
      requirePublicCompany,
      requireOwnCompany,
      computeContentRanking({
        fieldPaths: ['description', 'image', 'fundsNeeded.amount', 'lookingFor', 'alreadyHave'],
      }),
      requireVerifiedEmailToPublish,
      validateInvolvedUsers,
    ],
    afterChange: [
      lazySendItemUpdateNotifications('startups'),
      lazySendRelatedItemPublishedNotifications({
        childCollection: 'startups',
        getParentID: (doc) =>
          typeof doc.company === 'string' ? doc.company : (doc.company?.id ?? null),
        parentCollection: 'companies',
      }),
      lazyUpdateIdentityItemCountAfterChange('identity'),
    ],
    afterDelete: [lazyUpdateIdentityItemCountAfterDelete('identity')],
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
    create: canCreateContentWithPublicCompany,
    delete: onlyOwnDocsOrAdmin,
    read: publishedOrOwnDocsOrAdmin,
    update: onlyOwnDocsOrAdmin,
  },
  fields: [
    createdByField,
    serverURLField(),
    { name: 'title', type: 'text', required: true, maxLength: TEXT_INPUT_MAX_LENGTH },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
      filterOptions: publicCompanyFilter,
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
