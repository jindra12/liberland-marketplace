import type { GlobalConfig } from 'payload'
import { adminOnly } from '@/access/admin'
import { getServerSideURL } from '@/utilities/getURL'

/** Operator setup is separate from each seller's consent to USDC-on-Base payouts. */
export const MarketplacePayments: GlobalConfig = {
  slug: 'marketplace-payments',
  label: 'Marketplace payments',
  access: { read: adminOnly, update: adminOnly },
  fields: [
    {
      name: 'thirdwebCheckoutEnabled',
      label: 'Enable Thirdweb order checkout',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Enable only after registering the callback below in Thirdweb Bridge > Webhooks, configuring THIRDWEB_CLIENT_ID and THIRDWEB_WEBHOOK_SECRET, and testing delivery. Sellers must also opt in. This switch does not register or test the callback for you.',
      },
    },
    {
      name: 'thirdwebCallbackUrl',
      label: 'Shared Thirdweb callback URL',
      type: 'text',
      virtual: true,
      admin: { readOnly: true },
      access: { update: () => false },
      hooks: {
        afterRead: [() => new URL('/api/checkout/thirdweb', getServerSideURL()).href],
      },
    },
  ],
}
