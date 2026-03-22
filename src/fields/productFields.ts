import { onlyOwnDocsOrAdminFilter } from '@/access/onlyOwnDocsOrAdmin'
import { completenessScoreField } from "@/fields/completenessScoreField";
import { markdownField } from "@/fields/markdownField";
import { notificationSubscriberCountField } from '@/fields/notificationSubscriberCountField'
import { notificationSubscriptionStatusField } from '@/fields/notificationSubscriptionStatusField'
import { serverURLField } from '@/fields/serverURLField'
import { cryptoAddressesField } from '@/fields/cryptoAddressesField'
import { Field } from "payload";

const readonlyCryptoPriceField = ({
  label,
  name,
}: {
  label: string
  name: string
}): Field => ({
  name,
  type: 'text',
  virtual: true,
  access: {
    create: () => false,
    update: () => false,
  },
  admin: {
    hidden: true,
    readOnly: true,
  },
  label,
})

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
  readonlyCryptoPriceField({
    name: 'priceInETH',
    label: 'Price in ETH',
  }),
  readonlyCryptoPriceField({
    name: 'priceInSOL',
    label: 'Price in SOL',
  }),
  readonlyCryptoPriceField({
    name: 'priceInTRX',
    label: 'Price in TRX',
  }),
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
  notificationSubscriberCountField(),
  notificationSubscriptionStatusField('products'),
  completenessScoreField,
];
