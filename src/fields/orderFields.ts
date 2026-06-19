import type { Field } from 'payload'

import { adminOnlyFieldAccess } from '@/access/admin'

const chainOptions = [
  { label: 'Ethereum', value: 'ethereum' },
  { label: 'Solana', value: 'solana' },
  { label: 'Tron', value: 'tron' },
]

export type PaymentProofRow = {
  product?: string | { id?: string | number | null } | null
  chain?: 'ethereum' | 'solana' | 'tron' | null
  transactionHash?: string | null
  fulfilled?: boolean | null
  rejected?: boolean | null
}

const getPaymentProofRowKey = (row: PaymentProofRow): string => {
  const product =
    typeof row.product === 'string'
      ? row.product
      : row.product && typeof row.product === 'object' && 'id' in row.product
        ? String((row.product as { id?: unknown }).id ?? '')
        : ''

  return `${product}|${String(row.chain ?? '')}|${String(row.transactionHash ?? '')}`
}

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

export const orderFields: Field[] = [
  {
    name: 'payerAddress',
    label: 'Payer Address',
    type: 'text',
    access: {
      create: () => true,
      update: () => true,
    },
    hooks: {
      beforeChange: [
        ({ originalDoc, value }) => {
          if (typeof value === 'undefined') {
            return originalDoc?.payerAddress ?? null
          }

          if (typeof value !== 'string') {
            return value ?? null
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
  {
    name: 'paymentProofs',
    label: 'Payment Proofs',
    type: 'array',
    labels: {
      singular: 'Payment Proof',
      plural: 'Payment Proofs',
    },
    access: {
      create: () => false,
      update: () => true,
    },
    hooks: {
      beforeChange: [
        ({ operation, req, originalDoc, value }) => {
          if (operation !== 'update' || adminOnlyFieldAccess({ req })) {
            return value
          }

          const existingRows = Array.isArray(originalDoc?.paymentProofs)
            ? (originalDoc.paymentProofs as PaymentProofRow[])
            : []
          const incomingRows = Array.isArray(value) ? (value as PaymentProofRow[]) : []

          if (incomingRows.length === 0) {
            return existingRows
          }

          const existingKeys = new Set(existingRows.map(getPaymentProofRowKey))
          const appendedRows = incomingRows.filter((row) => {
            const key = getPaymentProofRowKey(row)
            if (existingKeys.has(key)) {
              return false
            }
            existingKeys.add(key)
            return true
          })

          return [...existingRows, ...appendedRows]
        },
      ],
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
      {
        name: 'fulfilled',
        label: 'Fulfilled',
        type: 'checkbox',
        defaultValue: false,
        admin: {
          description:
            'Mark this payment proof as fulfilled after the order has been shipped or delivered.',
        },
      },
      {
        name: 'rejected',
        label: 'Rejected',
        type: 'checkbox',
        defaultValue: false,
        admin: {
          description:
            'Mark this payment proof as rejected if the payment was invalid or should not be counted.',
        },
      },
    ],
  },
]
