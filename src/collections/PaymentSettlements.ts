import type { CollectionConfig } from 'payload'

/** Verified payment ownership is durable and unique; interrupted work resumes for that order. */
export const PaymentSettlements: CollectionConfig = {
  slug: 'payment-settlements',
  admin: { hidden: true },
  access: { create: () => false, read: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'key', type: 'text', unique: true, required: true },
    { name: 'order', type: 'relationship', relationTo: 'orders', required: true },
  ],
}
