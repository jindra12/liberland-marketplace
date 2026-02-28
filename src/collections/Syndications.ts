import { anyone } from '@/access/anyone'
import { markdownField } from '@/fields/markdownField'
import type { Access, CollectionConfig } from 'payload'

const adminOnly: Access = ({ req: { user } }) => user?.role?.includes('admin') || false

export const Syndications: CollectionConfig = {
  slug: 'syndications',
  versions: {
    drafts: true,
  },
  admin: {
    useAsTitle: 'name',
    group: 'Directory',
    defaultColumns: ['name', 'url', '_status'],
  },
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: anyone,
    update: adminOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'url',
      type: 'text',
      required: true,
      validate: (value?: null | string) => {
        if (!value?.trim()) {
          return 'URL is required.'
        }

        try {
          const parsed = new URL(value.trim())
          if (parsed.protocol !== 'https:') {
            return 'URL must use https.'
          }

          return true
        } catch {
          return 'Please enter a valid https URL.'
        }
      },
    },
    markdownField({
      name: 'description',
      label: 'Description',
    }),
  ],
}
