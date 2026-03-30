import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { authenticated } from '@/access/authenticated'
import { anyone } from '@/access/anyone'
import { onlyOwnProductsOrAdmin } from '@/access/onlyOwnProductsOrAdmin'
import { mergeProductCollectionFields, normalizeProductInventoryData } from '@/fields/productFields'
import { orderFields } from '@/fields/orderFields'
import { computeCompletenessScore } from '@/hooks/computeCompletenessScore'
import {
  lazyAutoConfirmOrderOnTransactionHashAdd,
  lazyComputeOrderAmountOnCreate,
  lazyLockOrderCryptoPricesOnCreate,
  lazyPopulateProductCryptoPrices,
  lazySendItemUpdateNotifications,
  lazySendRelatedItemPublishedNotifications,
  lazyUpdateIdentityItemCountAfterChange,
  lazyUpdateIdentityItemCountAfterDelete,
} from '@/hooks/lazyCollectionHooks'
import { requireOwnCompany } from '@/hooks/requireOwnCompany'
import { requireVerifiedEmailToPublish } from '@/hooks/requireVerifiedEmailToPublish'
import { syncCompanyIdentityId } from '@/hooks/syncCompanyIdentityId'
import { cryptoAdapter } from '@/payments/cryptoAdapter'
import { mergeFields } from '@/utilities/mergeFields'
import { replaceEcommerceAdminComponentPaths } from './replaceEcommerceAdminComponentPaths'

const nonAdminOrderUpdateKeys = new Set(['payerAddress', 'transactionHashes'])

const canUpdateOrderCheckoutFields = ({
  data,
  req,
}: {
  data?: unknown
  req: { user?: { role?: null | string | string[] } | null }
}): boolean => {
  const role = req.user?.role
  const isAdmin = Array.isArray(role) ? role.includes('admin') : role?.includes('admin') || false

  if (isAdmin) {
    return true
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false
  }

  const keys = Object.keys(data as Record<string, unknown>)

  return keys.length > 0 && keys.every((key) => nonAdminOrderUpdateKeys.has(key))
}

export const marketplaceEcommercePlugin = ecommercePlugin({
  access: {
    adminOnlyFieldAccess: ({ req }) => req.user?.role?.includes('admin') || false,
    adminOrPublishedStatus: ({ req }) =>
      req.user?.role?.includes('admin') ? true : { _status: { equals: 'published' } },
    isAdmin: ({ req }) => req.user?.role?.includes('admin') || false,
    isAuthenticated: authenticated,
    isCustomer: ({ req }) => !req.user?.role?.includes('admin'),
    isDocumentOwner: ({ req }) =>
      req.user?.role?.includes('admin') ? true : { customer: { equals: req.user?.id } },
  },
  customers: { slug: 'users' },
  carts: {
    cartsCollectionOverride: ({ defaultCollection }) => ({
      ...defaultCollection,
      fields: replaceEcommerceAdminComponentPaths(
        defaultCollection.fields.map((field) => {
          if ('name' in field && field.name === 'secret') {
            const secretField = field as any

            return {
              ...secretField,
              access: {
                // Allow filtering carts by secret in GraphQL/Local API.
                read: () => true,
              },
            } as any
          }

          return field
        }),
      ),
      hooks: {
        ...defaultCollection.hooks,
        afterRead: [
          ...(defaultCollection.hooks?.afterRead ?? []),
          ({ doc, req }) => {
            // Keep secret only in the initial cart creation response.
            if (!req.context?.newCartSecret) {
              delete (doc as { secret?: string }).secret
            }

            return doc
          },
        ],
      },
    }),
  },
  products: {
    variants: {
      variantsCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        fields: replaceEcommerceAdminComponentPaths(defaultCollection.fields),
      }),
    },
    productsCollectionOverride: ({ defaultCollection }) => ({
      ...defaultCollection,
      defaultSort: '-completenessScore',
      access: {
        ...defaultCollection.access,
        create: authenticated,
        read: anyone,
        update: onlyOwnProductsOrAdmin,
        delete: onlyOwnProductsOrAdmin,
      },
      admin: {
        ...defaultCollection.admin,
        useAsTitle: 'name',
        defaultColumns: [
          'name',
          ...((defaultCollection.admin?.defaultColumns || []).filter(
            (column) => column !== 'name',
          ) as string[]),
        ],
        components: {
          ...defaultCollection.admin?.components,
          edit: {
            ...defaultCollection.admin?.components?.edit,
            PublishButton: '@/components/VerifiedPublishButton',
          },
        },
      },
      fields: replaceEcommerceAdminComponentPaths(
        mergeProductCollectionFields(defaultCollection.fields),
      ),
      hooks: {
        ...defaultCollection.hooks,
        afterRead: [...(defaultCollection.hooks?.afterRead ?? []), lazyPopulateProductCryptoPrices],
        beforeChange: [
          requireOwnCompany,
          syncCompanyIdentityId,
          ({ data }) => normalizeProductInventoryData(data),
          computeCompletenessScore(['url', 'image', 'description', 'properties']),
          ...(defaultCollection.hooks?.beforeChange ?? []),
          requireVerifiedEmailToPublish,
        ],
        afterChange: [
          ...(defaultCollection.hooks?.afterChange ?? []),
          lazySendItemUpdateNotifications('products'),
          lazySendRelatedItemPublishedNotifications({
            childCollection: 'products',
            getParentID: (doc) =>
              typeof doc.company === 'string' ? doc.company : doc.company?.id ?? null,
            parentCollection: 'companies',
          }),
          lazyUpdateIdentityItemCountAfterChange('companyIdentityId'),
        ],
        afterDelete: [
          ...(defaultCollection.hooks?.afterDelete ?? []),
          lazyUpdateIdentityItemCountAfterDelete('companyIdentityId'),
        ],
      },
    }),
  },
  orders: {
    ordersCollectionOverride: ({ defaultCollection }) => ({
      ...defaultCollection,
      access: {
        ...defaultCollection.access,
        create: () => true,
        update: ({ data, req }) => canUpdateOrderCheckoutFields({ data, req }),
      },
      admin: {
        ...defaultCollection.admin,
        components: {
          ...defaultCollection.admin?.components,
          edit: {
            ...defaultCollection.admin?.components?.edit,
            beforeDocumentControls: [
              ...(defaultCollection.admin?.components?.edit?.beforeDocumentControls ?? []),
              '@/components/OrderConfirmButton',
            ],
          },
        },
      },
      fields: replaceEcommerceAdminComponentPaths(mergeFields(defaultCollection.fields, orderFields)),
      hooks: {
        ...defaultCollection.hooks,
        beforeChange: [
          ({ data, operation, req }) => {
            if (operation !== 'create' || !data) {
              return data
            }

            const isAdmin = req.user?.role?.includes('admin') || false

            if (isAdmin) {
              return data
            }

            const next = { ...data }

            // Non-admin checkout creates must not set lifecycle/admin fields.
            next.status = 'processing'
            next.transactions = []
            next.customer = req.user?.id ?? null

            return next
          },
          ...(defaultCollection.hooks?.beforeChange ?? []),
          lazyComputeOrderAmountOnCreate,
          lazyLockOrderCryptoPricesOnCreate,
        ],
        afterChange: [...(defaultCollection.hooks?.afterChange ?? []), lazyAutoConfirmOrderOnTransactionHashAdd],
      },
    }),
  },
  transactions: {
    transactionsCollectionOverride: ({ defaultCollection }) => ({
      ...defaultCollection,
      fields: replaceEcommerceAdminComponentPaths(defaultCollection.fields),
    }),
  },
  payments: {
    paymentMethods: [cryptoAdapter()],
  },
})
