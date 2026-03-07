import type { Field, FieldAccess } from 'payload'

const chainOptions = [
  { label: 'Ethereum', value: 'ethereum' },
  { label: 'Solana', value: 'solana' },
  { label: 'Tron', value: 'tron' },
]

const adminOnlyUpdateAccess: FieldAccess = ({ req }) => req.user?.role?.includes('admin') || false

const buildPriceValueFields = ({ required = false }: { required?: boolean } = {}): Field[] => [
  {
    name: 'stablePerNative',
    label: 'Stable Per Native',
    type: 'number',
    required,
    admin: { readOnly: true },
  },
  {
    name: 'nativePerStable',
    label: 'Native Per Stable',
    type: 'text',
    required,
    admin: { readOnly: true },
  },
  {
    name: 'expectedNativeAmount',
    label: 'Expected Native Amount',
    type: 'text',
    admin: { readOnly: true },
  },
  {
    name: 'fetchedAt',
    label: 'Fetched At',
    type: 'date',
    required,
    admin: { readOnly: true },
  },
]

const buildChainPriceGroupField = ({
  label,
  name,
}: {
  label: string
  name: string
}): Field => ({
  name,
  label,
  type: 'group',
  access: {
    create: () => false,
    update: () => false,
  },
  admin: { readOnly: true },
  fields: buildPriceValueFields(),
})

export const orderFields: Field[] = [
  {
    name: 'payerAddress',
    label: 'Payer Address',
    type: 'text',
    access: {
      create: () => true,
      update: () => false,
    },
    hooks: {
      beforeChange: [
        ({ operation, originalDoc, value }) => {
          if (operation === 'update') {
            return originalDoc?.payerAddress ?? null
          }

          if (typeof value !== 'string') {
            return value
          }

          const trimmed = value.trim()
          return trimmed.length > 0 ? trimmed : null
        },
      ],
    },
  },
  {
    name: 'cryptoPrices',
    label: 'Crypto Prices',
    type: 'array',
    labels: {
      singular: 'Crypto Price',
      plural: 'Crypto Prices',
    },
    access: {
      create: () => false,
      update: () => false,
    },
    fields: [
      {
        name: 'chain',
        type: 'select',
        required: true,
        options: chainOptions,
        admin: { readOnly: true },
      },
      ...buildPriceValueFields({ required: true }),
    ],
  },
  buildChainPriceGroupField({
    name: 'ethPrice',
    label: 'ETH Price',
  }),
  buildChainPriceGroupField({
    name: 'solanaPrice',
    label: 'Solana Price',
  }),
  buildChainPriceGroupField({
    name: 'tronPrice',
    label: 'Tron Price',
  }),
  {
    name: 'transactionHashes',
    label: 'Transaction Hashes',
    type: 'array',
    labels: {
      singular: 'Transaction Hash',
      plural: 'Transaction Hashes',
    },
    access: {
      create: () => false,
      update: adminOnlyUpdateAccess,
    },
    fields: [
      {
        name: 'product',
        label: 'Product',
        type: 'relationship',
        relationTo: 'products',
        required: true,
      },
      {
        name: 'chain',
        type: 'select',
        required: true,
        options: chainOptions,
      },
      {
        name: 'transactionHash',
        label: 'Transaction Hash',
        type: 'text',
        required: true,
      },
    ],
  },
]
