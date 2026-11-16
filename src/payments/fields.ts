import type { CollectionBeforeChangeHook, Field, FieldAccess } from 'payload'
import { toStringID } from '@/utilities/toStringID'
import { paymentWebhookUrlSchema } from './utils'
import { canAcceptCompanyDonations } from './integration'

const readIntegration: FieldAccess = ({ req, doc }) =>
  Boolean(
    req.user &&
    (req.user.role?.includes('admin') || toStringID(doc?.createdBy) === String(req.user.id)),
  )

export const paymentWebhookFields: Field[] = [
  {
    name: 'acceptThirdwebPayments',
    label: 'Accept card and crypto payments through Thirdweb',
    type: 'checkbox',
    defaultValue: false,
    admin: {
      description:
        'Allow normal orders to settle in USDC on Base at the saved Ethereum-compatible payout wallet. The marketplace confirms payments automatically; no company webhook is needed.',
    },
  },
  {
    name: 'canAcceptThirdwebDonations',
    type: 'checkbox',
    virtual: true,
    admin: { hidden: true, readOnly: true },
    access: { create: () => false, update: () => false },
    hooks: {
      afterRead: [
        ({ data, req }) =>
          data?.acceptThirdwebDonations ? canAcceptCompanyDonations(req, String(data.id)) : false,
      ],
    },
  },
  {
    name: 'acceptThirdwebDonations',
    label: 'Accept donations in Thirdweb',
    type: 'checkbox',
    defaultValue: false,
    admin: {
      description:
        'Show a Donate button on the company profile. Requires a payout wallet and configured payment notifications.',
    },
  },
  {
    name: 'paymentWebhookUrl',
    type: 'text',
    maxLength: 100,
    access: { read: readIntegration },
    validate: (value: string | null | undefined) =>
      !value ||
      paymentWebhookUrlSchema.safeParse(value).success ||
      'Enter a public HTTPS webhook URL (maximum 100 characters).',
    admin: {
      description:
        'Receives signed payment.completed events for hosted product payments and donations.',
    },
  },
  {
    name: 'paymentWebhookSecret',
    type: 'text',
    hidden: true,
    access: { read: () => false, create: () => false, update: () => false },
    admin: {
      readOnly: true,
      description:
        'Legacy server-only credential. New credentials are issued once through the payment integration actions.',
    },
  },
]

export const preserveLegacyPaymentSecret: CollectionBeforeChangeHook = ({ data, originalDoc }) => ({
  ...data,
  paymentWebhookSecret: originalDoc?.paymentWebhookSecret,
})
