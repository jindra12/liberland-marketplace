import { anyone } from '@/access/anyone'
import { markdownField } from '@/fields/markdownField'
import type { Access, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import type { Syndication, User } from '@/payload-types'

const adminOnly: Access = ({ req: { user } }) => user?.role?.includes('admin') || false
const isAdminUser = (user: User | null | undefined): boolean => user?.role?.includes('admin') || false

const publishedOrAdmin: Access = ({ req: { user } }) => {
  if (isAdminUser(user)) {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}

const forceDraftOnCreate: CollectionBeforeValidateHook<Syndication> = ({ data, operation, req }) => {
  if (operation !== 'create' || isAdminUser(req.user)) {
    return data
  }

  return {
    ...data,
    _status: 'draft',
  }
}

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
    create: anyone,
    delete: adminOnly,
    read: publishedOrAdmin,
    update: adminOnly,
  },
  hooks: {
    beforeValidate: [forceDraftOnCreate],
  },
  fields: [
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      maxDepth: 0,
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
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
    {
      name: 'autoEnable',
      type: 'checkbox',
      label: 'Auto enable?',
      defaultValue: false,
    },
    {
      name: 'nsfw',
      type: 'checkbox',
      label: 'NSFW',
      defaultValue: false,
    },
    markdownField({
      name: 'description',
      label: 'Description',
    }),
  ],
}
