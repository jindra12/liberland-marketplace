import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import type { Plugin } from 'payload'
import { betterAuthPlugin } from 'payload-auth/better-auth'
import { oidcProvider } from 'better-auth/plugins'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'

import type { Page, Post } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'
import { addCreatedBy } from './addCreatedBy'
import { marketplaceEcommercePlugin } from './ecommerce'
import { hideAdminCollections } from './hideAdminCollections'
import { protectUserFields } from './protectUserFields'
import { comments } from './comments'
import { seedOIDCClient } from './seedOIDCClient'
import { addOIDCTokenStrategy } from './oidcTokenStrategy'
import { fixOAuthClientId } from './fixOAuthClientId'
import { likesPlugin } from './likes'
import { deferSearchSyncPlugin } from './deferSearchSync'
import { sendAuthEmail } from '@/utilities/sendAuthEmail'

const betterAuthSecret = process.env.BETTER_AUTH_SECRET

if (!betterAuthSecret) {
  throw new Error('Missing BETTER_AUTH_SECRET environment variable')
}

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | Payload Website Template` : 'Payload Website Template'
}

const generateURL: GenerateURL<Post | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  comments,
  addCreatedBy,
  betterAuthPlugin({
    disableDefaultPayloadAuth: true,
    hidePluginCollections: true,
    betterAuthOptions: {
      secret: betterAuthSecret,
      baseURL: process.env.NEXT_PUBLIC_SERVER_URL,
      trustedOrigins: (process.env.OIDC_REDIRECT_URLS || '')
        .split(',')
        .filter(Boolean)
        .map((url) => new URL(url).origin),
      emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }) => {
          await sendAuthEmail({
            to: user.email,
            subject: 'Reset your password — Nswap Marketplace',
            html: `
              <h1>Reset your password</h1>
              <p>We received a request to reset the password for your Nswap Marketplace account.</p>
              <p><a href="${url}">Reset Password</a></p>
              <p>This link will expire. If you did not request a password reset, you can safely ignore this email.</p>
            `,
          })
        },
      },
      emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
          await sendAuthEmail({
            to: user.email,
            subject: 'Verify your email — Nswap Marketplace',
            html: `
              <h1>Welcome to Nswap Marketplace!</h1>
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
      user: {
        additionalFields: {
          identity: {
            type: 'string',
            required: false,
            input: true,
          },
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
      allowedFields: ['name', 'identity'],
      collectionOverrides: ({ collection }) => ({
        ...collection,
        admin: {
          ...collection.admin,
          components: {
            ...collection.admin?.components,
            edit: {
              ...collection.admin?.components?.edit,
              beforeDocumentControls: [
                ...(collection.admin?.components?.edit?.beforeDocumentControls ?? []),
                '@/components/BanUserButton',
              ],
            },
          },
        },
      }),
    },
  }),
  protectUserFields,
  fixOAuthClientId,
  addOIDCTokenStrategy,
  seedOIDCClient,
  likesPlugin,
  marketplaceEcommercePlugin,
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
    collections: ['jobs', 'companies', 'identities', 'products', 'startups', 'posts'],
    beforeSync: beforeSyncWithSearch,
    searchOverrides: {
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
      admin: {
        group: 'Directory',
      },
    },
  }),
  deferSearchSyncPlugin,
  hideAdminCollections,
]
