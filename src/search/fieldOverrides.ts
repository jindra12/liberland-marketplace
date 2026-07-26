import { Field } from 'payload'
import { TEXTAREA_MAX_LENGTH, TEXT_INPUT_MAX_LENGTH } from '@/fields/constants'

export const searchFields: Field[] = [
  {
    name: 'slug',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    index: true,
    admin: {
      readOnly: true,
    },
  },
  {
    name: 'meta',
    label: 'Meta',
    type: 'group',
    index: true,
    admin: {
      readOnly: true,
    },
    fields: [
      {
        type: 'text',
        name: 'title',
        label: 'Title',
        maxLength: TEXT_INPUT_MAX_LENGTH,
      },
      {
        type: 'text',
        name: 'description',
        label: 'Description',
        maxLength: TEXTAREA_MAX_LENGTH,
      },
      {
        name: 'image',
        label: 'Image',
        type: 'upload',
        relationTo: 'media',
      },
    ],
  },
  {
    label: 'Categories',
    name: 'categories',
    type: 'array',
    admin: {
      readOnly: true,
    },
    fields: [
      {
        name: 'relationTo',
        type: 'text',
        maxLength: TEXT_INPUT_MAX_LENGTH,
      },
      {
        name: 'categoryID',
        type: 'text',
        maxLength: TEXT_INPUT_MAX_LENGTH,
      },
      {
        name: 'title',
        type: 'text',
        maxLength: TEXT_INPUT_MAX_LENGTH,
      },
    ],
  },
]
