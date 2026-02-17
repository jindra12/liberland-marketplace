import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { Plugin } from 'payload'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { betterAuthPlugin } from 'payload-auth/better-auth'
import { oidcProvider } from 'better-auth/plugins'
import nodemailer from 'nodemailer'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'

import { Page, Post } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'
import { addCreatedBy } from './addCreatedBy'
import { hideAdminCollections } from './hideAdminCollections'
import { authenticated } from '@/access/authenticated'
import { anyone } from '@/access/anyone'
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin'
import { requireVerifiedEmailToPublish } from '@/hooks/requireVerifiedEmailToPublish'
import { mergeFields } from '@/utilities/mergeFields'
import { productFields } from '@/fields/productFields'
import { cryptoAdapter } from '@/payments/cryptoAdapter'
import { protectUserFields } from './protectUserFields'

const smtpTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | Payload Website Template` : 'Payload Website Template'
}

const generateURL: GenerateURL<Post | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  addCreatedBy,
  betterAuthPlugin({
    disableDefaultPayloadAuth: true,
    hidePluginCollections: true,
    betterAuthOptions: {
      baseURL: process.env.NEXT_PUBLIC_SERVER_URL,
      trustedOrigins: (process.env.OIDC_REDIRECT_URLS || '')
        .split(',')
        .filter(Boolean)
        .map((url) => new URL(url).origin),
      emailAndPassword: {
        enabled: true,
      },
      emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
          const fromAddress = process.env.SMTP_FROM_ADDRESS || 'noreply@liberland.org'
          const fromName = process.env.SMTP_FROM_NAME || 'Liberland Marketplace'
          await smtpTransport.sendMail({
            from: `"${fromName}" <${fromAddress}>`,
            to: user.email,
            subject: 'Verify your email — Liberland Marketplace',
            html: `
              <h1>Welcome to Liberland Marketplace!</h1>
              <p>Please verify your email address by clicking the link below:</p>
              <p><a href="${url}">Verify Email</a></p>
              <p>If you did not create an account, you can safely ignore this email.</p>
            `,
          })
        },
      },
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID || '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        },
      },
      plugins: [
        oidcProvider({
          loginPage: '/login',
          requirePKCE: true,
          allowDynamicClientRegistration: false,
          trustedClients: process.env.OIDC_CLIENT_ID
            ? [
                {
                  clientId: process.env.OIDC_CLIENT_ID,
                  clientSecret: process.env.OIDC_CLIENT_SECRET || '',
                  name: 'Frontend App',
                  type: 'web' as const,
                  redirectUrls: (process.env.OIDC_REDIRECT_URLS || '').split(',').filter(Boolean),
                  metadata: null,
                  skipConsent: true,
                  disabled: false,
                },
              ]
            : [],
        }),
      ],
    },
    users: {
      slug: 'users',
      adminRoles: ['admin', 'user'],
      defaultRole: 'user',
      defaultAdminRole: 'admin',
      roles: ['user', 'admin'],
      allowedFields: ['name'],
    },
  }),
  protectUserFields,
  ecommercePlugin({
    access: {
      adminOnlyFieldAccess: ({ req }) => req.user?.role?.includes('admin') || false,
      adminOrPublishedStatus: ({ req }) =>
        req.user?.role?.includes('admin')
          ? true
          : { _status: { equals: 'published' } },
      isAdmin: ({ req }) => req.user?.role?.includes('admin') || false,
      isAuthenticated: authenticated,
      isCustomer: ({ req }) => !req.user?.role?.includes('admin'),
      isDocumentOwner: ({ req }) =>
        req.user?.role?.includes('admin')
          ? true
          : { customer: { equals: req.user?.id } },
    },
    customers: { slug: 'users' },
    products: {
      productsCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        access: {
          ...defaultCollection.access,
          create: authenticated,
          read: anyone,
          update: onlyOwnDocsOrAdmin,
          delete: onlyOwnDocsOrAdmin,
        },
        admin: {
          ...defaultCollection.admin,
          components: {
            ...defaultCollection.admin?.components,
            edit: {
              ...defaultCollection.admin?.components?.edit,
              PublishButton: '@/components/VerifiedPublishButton',
            },
          },
        },
        fields: mergeFields(defaultCollection.fields, productFields),
        hooks: {
          ...defaultCollection.hooks,
          beforeChange: [
            ...(defaultCollection.hooks?.beforeChange ?? []),
            requireVerifiedEmailToPublish,
          ],
        },
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
  hideAdminCollections,
]
