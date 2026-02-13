import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { Plugin } from 'payload'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { betterAuthPlugin } from 'payload-auth/better-auth'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'

import type { CollectionConfig, Field } from 'payload'
import { Page, Post } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'
import { addCreatedBy } from './addCreatedBy'
import { authenticated } from '@/access/authenticated'
import { mergeFields } from '@/utilities/mergeFields'
import { productFields } from '@/fields/productFields'
import { cryptoAdapter } from '@/payments/cryptoAdapter'

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | Payload Website Template` : 'Payload Website Template'
}

const generateURL: GenerateURL<Post | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

/**
 * The payload-auth plugin adds explicit createdAt/updatedAt date fields with
 * `required: true` to every collection it creates. Payload CMS also adds its
 * own createdAt/updatedAt via Mongoose timestamps, causing a "field is invalid"
 * validation error when the duplicate required date field receives no value
 * during internal operations like login/session creation.
 *
 * This helper relaxes the plugin's timestamp fields so they never block
 * validation, while Payload's built-in timestamps continue to manage the
 * actual values.
 */
function fixTimestampFields(collection: CollectionConfig): CollectionConfig {
  return {
    ...collection,
    fields: collection.fields.map((f) => {
      if ('name' in f && (f.name === 'createdAt' || f.name === 'updatedAt')) {
        return { ...f, required: false, validate: () => true as const } as typeof f
      }
      return f
    }),
  }
}

export const plugins: Plugin[] = [
  addCreatedBy,
  betterAuthPlugin({
    betterAuthOptions: {
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID || '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        },
      },
    },
    users: {
      collectionOverrides: ({ collection }) => {
        const fixed = fixTimestampFields(collection)
        return {
          ...fixed,
          // Remove 'join' fields — they require MongoDB 5.1+ ($lookup with pipeline + localField)
          fields: fixed.fields.filter((f) => !('type' in f && f.type === 'join')),
        }
      },
    },
    sessions: {
      collectionOverrides: ({ collection }) => fixTimestampFields(collection),
    },
    accounts: {
      collectionOverrides: ({ collection }) => fixTimestampFields(collection),
    },
    verifications: {
      collectionOverrides: ({ collection }) => fixTimestampFields(collection),
    },
  }),
  ecommercePlugin({
    access: {
      adminOnlyFieldAccess: ({ req }) => req.user?.isAdmin || false,
      adminOrPublishedStatus: ({ req }) =>
        req.user?.isAdmin
          ? true
          : { _status: { equals: 'published' } },
      isAdmin: ({ req }) => req.user?.isAdmin || false,
      isAuthenticated: authenticated,
      isCustomer: ({ req }) => !req.user?.isAdmin,
      isDocumentOwner: ({ req }) =>
        req.user?.isAdmin
          ? true
          : { customer: { equals: req.user?.id } },
    },
    customers: { slug: 'users' },
    products: {
      productsCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        fields: mergeFields(defaultCollection.fields, productFields),
      }),
    },
    payments: {
      paymentMethods: [cryptoAdapter()],
    },
  }),
  redirectsPlugin({
    collections: ['pages', 'posts'],
    overrides: {
      // @ts-expect-error - This is a valid override, mapped fields don't resolve to the same type
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'from') {
            return {
              ...field,
              admin: {
                description: 'You will need to rebuild the website when changing this field.',
              },
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateRedirects],
      },
    },
  }),
  nestedDocsPlugin({
    collections: ['categories'],
    generateURL: (docs) => docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
  }),
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formOverrides: {
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })
      },
    },
  }),
  searchPlugin({
    collections: ['jobs', 'companies', 'identities', 'products'],
    beforeSync: beforeSyncWithSearch,
    searchOverrides: {
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
      admin: {
        group: false,
      },
    },
  }),
  vercelBlobStorage({
    collections: {
      media: true,
    },
    token: process.env.BLOB_READ_WRITE_TOKEN,
  }),
]
