import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { markdownField } from '@/fields/markdownField'
import { requireVerifiedEmailToPublish } from '@/hooks/requireVerifiedEmailToPublish'
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
  endpoints: [joinStartup, leaveStartup],
  hooks: {
    beforeChange: [requireVerifiedEmailToPublish, validateInvolvedUsers],
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
    read: anyone,
    update: onlyOwnDocsOrAdmin,
  },
  fields: [
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
  ],
}
