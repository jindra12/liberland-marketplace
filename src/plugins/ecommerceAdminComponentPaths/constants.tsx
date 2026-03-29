import type { EcommerceAdminComponentAliases } from './types'

export const ecommerceAdminComponentAliases = {
  '@payloadcms/plugin-ecommerce/client#PriceCell': '@/components/PayloadEcommerce/PriceCell',
  '@payloadcms/plugin-ecommerce/rsc#PriceInput': '@/components/PayloadEcommerce/PriceInput',
  '@payloadcms/plugin-ecommerce/rsc#VariantOptionsSelector':
    '@/components/PayloadEcommerce/VariantOptionsSelector',
} as const satisfies EcommerceAdminComponentAliases
