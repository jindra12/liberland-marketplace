import type { Field, FieldHookArgs } from 'payload'
import type { Order } from '@/payload-types'

import { adminOnlyFieldAccess } from '@/access/admin'
import { TEXT_INPUT_MAX_LENGTH } from './constants'
import { toStringID } from '@/utilities/toStringID'
import { updateAtomically } from '@/utilities/atomicUpdates/utils'
import { mergeCustomerPaymentProofs } from '@/crypto/proofs/utils'
import { APIError } from 'payload'

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

export type PaymentTargetRow = {
  chain?: 'ethereum' | 'solana' | 'tron' | null
  normalizedRecipientAddress?: string | null
  productID?: string | null
  quantity?: number | null
  recipientAddress?: string | null
  stableAmount?: number | null
  unitAmount?: number | null
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
    maxLength: TEXT_INPUT_MAX_LENGTH,
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
    name: 'paymentTargets',
    label: 'Payment Targets',
    type: 'array',
    labels: {
      singular: 'Payment Target',
      plural: 'Payment Targets',
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
      {
        name: 'productID',
        type: 'text',
        maxLength: TEXT_INPUT_MAX_LENGTH,
        required: true,
        admin: { readOnly: true },
      },
      {
        name: 'quantity',
        type: 'number',
        required: true,
        admin: { readOnly: true },
      },
      {
        name: 'recipientAddress',
        type: 'text',
        maxLength: TEXT_INPUT_MAX_LENGTH,
        required: true,
        admin: { readOnly: true },
      },
      {
        name: 'normalizedRecipientAddress',
        type: 'text',
        maxLength: TEXT_INPUT_MAX_LENGTH,
        required: true,
        admin: { readOnly: true },
      },
      {
        name: 'stableAmount',
        type: 'number',
        required: true,
        admin: { readOnly: true },
      },
      {
        name: 'unitAmount',
        type: 'number',
        required: true,
        admin: { readOnly: true },
      },
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
        async ({
          operation,
          req,
          originalDoc,
          value,
          siblingData,
        }: FieldHookArgs<Order, Order['paymentProofs'], Partial<Order>>) => {
          if (
            operation !== 'update' ||
            adminOnlyFieldAccess({ req }) ||
            req.context.skipPaymentProofMerge
          ) {
            return value
          }
          if (value === undefined) {
            return value
          }
          const incoming = Array.isArray(value) ? value : []
          await updateAtomically({
            collection: 'orders',
            id: originalDoc!.id,
            req,
            update: async (current) => {
              if (toStringID(current.customer) !== String(req.user!.id)) {
                throw new APIError('You do not own this order.', 403)
              }
              const paymentProofs = await mergeCustomerPaymentProofs(current, incoming, req)
              return paymentProofs ? { paymentProofs } : null
            },
          })
          // The canonical CAS write already applied the append. The enclosing update
          // must not replace that array using its earlier read snapshot.
          delete siblingData.paymentProofs
          return undefined
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
        maxLength: TEXT_INPUT_MAX_LENGTH,
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
