import type { CollectionConfig } from 'payload'
import { checkoutReturnUrlSchema } from './utils'

/** Sessions and delivery evidence are private; public checkout uses a restricted endpoint. */
export const CheckoutSessions: CollectionConfig = {
  slug: 'checkout-sessions',
  admin: { hidden: true },
  access: { create: () => false, read: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'publicId', type: 'text', required: true, unique: true },
    { name: 'company', type: 'relationship', relationTo: 'companies' },
    { name: 'order', type: 'relationship', relationTo: 'orders', index: true },
    { name: 'orderPaymentKey', type: 'text', unique: true },
    { name: 'orderRecordedAt', type: 'date' },
    { name: 'destinationTransactionHash', type: 'text', unique: true },
    { name: 'product', type: 'relationship', relationTo: 'products' },
    { name: 'title', type: 'text', required: true },
    { name: 'kind', type: 'select', options: ['donation', 'product', 'order'], required: true },
    { name: 'quantity', type: 'number', required: true },
    { name: 'amountUsdCents', type: 'number', required: true },
    { name: 'receiver', type: 'text', required: true },
    { name: 'externalReference', type: 'text', maxLength: 100 },
    {
      name: 'returnUrl',
      type: 'text',
      maxLength: 2048,
      validate: (value: string | null | undefined) =>
        !value ||
        checkoutReturnUrlSchema.safeParse(value).success ||
        'Invalid checkout return URL.',
    },
    { name: 'webhookUrl', type: 'text' },
    { name: 'expiresAt', type: 'date', required: true },
    {
      name: 'status',
      type: 'select',
      options: ['pending', 'paid'],
      defaultValue: 'pending',
      required: true,
    },
    { name: 'paymentId', type: 'text', unique: true, index: true },
    { name: 'notification', type: 'json' },
    { name: 'deliveredAt', type: 'date' },
  ],
}

/** Unversioned credentials cannot be revealed or restored through company history. */
export const PaymentWebhookCredentials: CollectionConfig = {
  slug: 'payment-webhook-credentials',
  admin: { hidden: true },
  access: { create: () => false, read: () => false, update: () => false, delete: () => false },
  fields: [
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
      unique: true,
    },
    { name: 'secret', type: 'text', required: true, hidden: true, access: { read: () => false } },
  ],
}
