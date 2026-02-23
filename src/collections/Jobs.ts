import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { onlyOwnDocsOrAdmin, onlyOwnDocsOrAdminFilter } from '@/access/onlyOwnDocsOrAdmin'
import { markdownField } from '@/fields/markdownField'
import { requireVerifiedEmailToPublish } from '@/hooks/requireVerifiedEmailToPublish'
import { syncCompanyIdentityId } from '@/hooks/syncCompanyIdentityId'
import { getCurrencies } from '@/utilities/getCurrencies'
import type { CollectionConfig } from 'payload'

export const Jobs: CollectionConfig = {
  slug: 'jobs',
  hooks: {
    beforeChange: [syncCompanyIdentityId, requireVerifiedEmailToPublish],
  },
  admin: {
    useAsTitle: 'title',
    group: 'Careers',
    defaultColumns: ['title', 'company', 'location', 'employmentType', 'postedAt', '_status'],
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
  versions: {
    drafts: true,
  },
  access: {
    create: authenticated,
    delete: onlyOwnDocsOrAdmin,
    read: anyone,
    update: onlyOwnDocsOrAdmin,
  },
  fields: [
    { name: 'title', type: 'text', required: true },

    // Each job connected to a company
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
      filterOptions: onlyOwnDocsOrAdminFilter,
    },
    {
      name: 'companyIdentityId',
      type: 'text',
      index: true,
      admin: {
        hidden: true,
        readOnly: true,
      },
    },

    { name: 'location', type: 'text' },
    { name: 'isActive', type: 'checkbox', defaultValue: true },
    { name: 'positions', type: 'number', required: true, min: 1, defaultValue: 1 },

    {
      name: 'employmentType',
      type: 'select',
      required: true,
      defaultValue: 'full-time',
      options: [
        { label: 'Full-time', value: 'full-time' },
        { label: 'Part-time', value: 'part-time' },
        { label: 'Contract', value: 'contract' },
        { label: 'Internship', value: 'internship' },
        { label: 'Gig', value: 'gig' },
      ],
    },

    // Salary range
    {
      name: 'salaryRange',
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'min', type: 'number', min: 0 },
            { name: 'max', type: 'number', min: 0 },
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
      name: 'bounty',
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
      name: 'postedAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
    },
    {
      name: 'allowedIdentities',
      label: 'Allowed identities',
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
      label: 'Disallowed identities',
      type: 'relationship',
      relationTo: 'identities',
      hasMany: true,
      index: true,
      admin: {
        allowCreate: true,
        allowEdit: true,
      },
    },
    markdownField({
      name: 'description',
      label: 'Description',
    }),
    { name: 'applyUrl', type: 'text' },
  ],
}
