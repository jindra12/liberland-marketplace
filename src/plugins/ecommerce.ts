import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { canCreateContentWithPublicCompany } from '@/access/publicCompanyAccess'
import { authenticated } from '@/access/authenticated'
import { addressFields } from '@/fields/addressFields'
import { anyone } from '@/access/anyone'
import { onlyOwnProductsOrAdmin } from '@/access/onlyOwnProductsOrAdmin'
import { mergeProductCollectionFields, normalizeProductInventoryData } from '@/fields/productFields'
import { appendParametersToItemsField } from '@/fields/productParameterFields'
import { createLikeableFields } from '@/likes/fields'
import { orderFields } from '@/fields/orderFields'
import { computeContentRanking } from '@/hooks/computeContentRanking'
import {
  lazyAutoConfirmOrderOnPaymentProofAdd,
  lazyComputeOrderAmountOnCreate,
  lazyLockOrderCryptoPricesOnCreate,
  lazyPopulateProductCryptoPrices,
  lazySendOrderCompletedNotifications,
  lazySendItemUpdateNotifications,
  lazySendRelatedItemPublishedNotifications,
  lazyUpdateIdentityItemCountAfterChange,
  lazyUpdateIdentityItemCountAfterDelete,
  lazyUpdateProductPurchaseCountAfterOrderValidation,
} from '@/hooks/lazyCollectionHooks'
import { validateItemParametersBeforeChange } from '@/hooks/validateItemParameters'
import { requireOwnCompany } from '@/hooks/requireOwnCompany'
import { requirePublicCompany } from '@/hooks/requirePublicCompany'
import { requireVerifiedEmailToPublish } from '@/hooks/requireVerifiedEmailToPublish'
import { syncCompanyIdentityId } from '@/hooks/syncCompanyIdentityId'
import { cryptoAdapter } from '@/payments/cryptoAdapter'
import { mergeFields } from '@/utilities/mergeFields'
import { replaceEcommerceAdminComponentPaths } from './replaceEcommerceAdminComponentPaths'
import type { Field } from 'payload'
import type { PayloadRequest } from 'payload'
import type { AccessUser } from '@/access/types'

const nonAdminOrderUpdateKeys = new Set(['payerAddress', 'paymentProofs'])

const getOrderCustomerID = async ({
  id,
  req,
}: {
  id?: string | number | null
  req: PayloadRequest
}): Promise<string | null> => {
  if (!id) {
    return null
  }

  try {
    const order = await req.payload.findByID({
      collection: 'orders',
      depth: 0,
      id: String(id),
      overrideAccess: true,
      req,
      select: {
        customer: true,
      },
    })

    if (!order || typeof order !== 'object' || Array.isArray(order)) {
      return null
    }

    const customer = 'customer' in order ? order.customer : null
    if (typeof customer === 'string' || typeof customer === 'number') {
      return String(customer)
    }

    if (customer && typeof customer === 'object' && !Array.isArray(customer)) {
      const customerID = 'id' in customer ? customer.id : null
      if (typeof customerID === 'string' || typeof customerID === 'number') {
        return String(customerID)
      }
    }
  } catch {
    return null
  }

  return null
}

const canUpdateOrderCheckoutFields = async ({
  data,
  id,
  req,
}: {
  data?: unknown
  id?: string | number
  req: { user?: AccessUser } & PayloadRequest
}): Promise<boolean> => {
  const role = req.user?.role
  const isAdmin = role?.includes('admin') || false

  if (isAdmin) {
    return true
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false
  }

  const keys = Object.keys(data as Record<string, unknown>)

  if (keys.length === 0 || !keys.every((key) => nonAdminOrderUpdateKeys.has(key))) {
    return false
  }

  const userID = req.user?.id
  if (!userID) {
    return false
  }

  const orderCustomerID = await getOrderCustomerID({
    id,
    req,
  })

  return orderCustomerID === String(userID)
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
  addresses: {
    addressFields: () => addressFields(),
  },
  customers: { slug: 'users' },
  carts: {
    cartsCollectionOverride: ({ defaultCollection }) => ({
      ...defaultCollection,
      fields: replaceEcommerceAdminComponentPaths(
        appendParametersToItemsField(defaultCollection.fields).map((field) => {
          if ('name' in field && field.name === 'secret') {
            const secretField = field as Field

            return {
              ...secretField,
              access: {
                // Allow filtering carts by secret in GraphQL/Local API.
                read: () => true,
              },
            } as Field
          }

          return field
        }),
      ),
      hooks: {
        ...defaultCollection.hooks,
        beforeChange: [
          validateItemParametersBeforeChange,
          ...(defaultCollection.hooks?.beforeChange ?? []),
        ],
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
      defaultSort: '-contentRankScore',
      access: {
        ...defaultCollection.access,
        create: canCreateContentWithPublicCompany,
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
        mergeFields(
          mergeProductCollectionFields(defaultCollection.fields),
          createLikeableFields('products'),
        ),
      ),
      hooks: {
        ...defaultCollection.hooks,
        afterRead: [...(defaultCollection.hooks?.afterRead ?? []), lazyPopulateProductCryptoPrices],
        beforeChange: [
          requirePublicCompany,
          requireOwnCompany,
          syncCompanyIdentityId,
          ({ data }) => normalizeProductInventoryData(data),
          computeContentRanking({
            fieldPaths: ['url', 'image', 'description', 'properties'],
          }),
          ...(defaultCollection.hooks?.beforeChange ?? []),
          requireVerifiedEmailToPublish,
        ],
        afterChange: [
          ...(defaultCollection.hooks?.afterChange ?? []),
          lazySendItemUpdateNotifications('products'),
          lazySendRelatedItemPublishedNotifications({
            childCollection: 'products',
            getParentID: (doc) =>
              typeof doc.company === 'string' ? doc.company : (doc.company?.id ?? null),
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
        update: async ({ data, id, req }) =>
          canUpdateOrderCheckoutFields({
            data,
            id,
            req,
          }),
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
              '@/components/OrderInventoryButton',
            ],
          },
        },
      },
      fields: replaceEcommerceAdminComponentPaths(
        mergeFields(appendParametersToItemsField(defaultCollection.fields), orderFields),
      ),
      hooks: {
        ...defaultCollection.hooks,
        beforeChange: [
          validateItemParametersBeforeChange,
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
        afterChange: [
          ...(defaultCollection.hooks?.afterChange ?? []),
          lazyAutoConfirmOrderOnPaymentProofAdd,
          lazyUpdateProductPurchaseCountAfterOrderValidation,
          lazySendOrderCompletedNotifications,
        ],
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
