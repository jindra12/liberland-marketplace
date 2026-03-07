import { markdownField } from "@/fields/markdownField";
import { serverURLField } from '@/fields/serverURLField'
import { cryptoAddressesField } from '@/fields/cryptoAddressesField'
import { Field } from "payload";

export const productFields: Field[] = [
  serverURLField(),
  {
    name: 'name',
    type: 'text',
    required: true,
  },

  {
    name: 'company',
    type: 'relationship',
    relationTo: 'companies',
    required: true,
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

  {
    name: 'url',
    type: 'text',
    required: false,
  },

  {
    name: 'orderable',
    type: 'checkbox',
    defaultValue: true,
  },
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
    name: 'properties',
    type: 'array',
    fields: [
      {
        name: 'key',
        type: 'text',
        required: true,
      },
      {
        name: 'value',
        type: 'text',
      },
    ],
  },
];
