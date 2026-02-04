import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin'
import type { CollectionConfig } from 'payload'

export const Jobs: CollectionConfig = {
  slug: 'jobs',
  admin: {
    useAsTitle: 'title',
    group: 'Careers',
    defaultColumns: ['title', 'company', 'location', 'employmentType', 'postedAt', '_status'],
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
    },

    { name: 'location', type: 'text' },

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
              options: [
                { label: 'USD', value: 'USD' },
                { label: 'EUR', value: 'EUR' },
                { label: 'GBP', value: 'GBP' },
                { label: 'CZK', value: 'CZK' },
              ],
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

    { name: 'description', type: 'richText' },
    { name: 'applyUrl', type: 'text' },
  ],
}
