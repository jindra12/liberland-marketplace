import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'

import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { Identities } from './collections/Identities'
import { Companies } from './collections/Companies'
import { Jobs } from './collections/Jobs'
import CommentLikes from './collections/CommentLikes'
import { Startups } from './collections/Startups'
import { Syndications } from './collections/Syndications'
import { backfillEndpoint } from './endpoints/backfill'
import { confirmCryptoOrderEndpoint } from './endpoints/confirmCryptoOrder'
import { analyticsConfigEndpoint } from './endpoints/analytics/config'
import { NotificationSubscriptions } from './collections/NotificationSubscriptions'
import { Subscribers } from './collections/Subscribers'
import { analyticsGraphQLMutations } from './graphql/analytics'
import { sellerOrderGraphQLMutations, sellerOrderGraphQLQueries } from './graphql/sellerOrders'
import { permissionsGraphQLQueries } from './graphql/permissions'
import { shareGraphQLMutations } from './graphql/share'
import { startupGraphQLMutations } from './graphql/startups'
import { userGraphQLMutations, userGraphQLQueries } from './graphql/users'
import { Reports } from './collections/Reports'
import { InformationRequests } from './collections/InformationRequests'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const enablePayloadLivePreview =
  process.env.NODE_ENV === 'production' || process.env.PAYLOAD_ENABLE_LIVE_PREVIEW === 'true'
const payloadDebug = process.env.PAYLOAD_DEBUG === 'true'
const payloadSecret = process.env.PAYLOAD_SECRET

if (!payloadSecret) {
  throw new Error('Missing PAYLOAD_SECRET environment variable')
}

export default buildConfig({
  admin: {
    ...(enablePayloadLivePreview
      ? {
          livePreview: {
            breakpoints: [
              {
                label: 'Mobile',
                name: 'mobile',
                width: 375,
                height: 667,
              },
              {
                label: 'Tablet',
                name: 'tablet',
                width: 768,
                height: 1024,
              },
              {
                label: 'Desktop',
                name: 'desktop',
                width: 1440,
                height: 900,
              },
            ],
          },
        }
      : {}),
    components: {
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeLogin: ['@/components/BeforeLogin'],
      Nav: '@/components/AdminAnalyticsNavLink',
      views: {
        analytics: {
          Component: '@/components/AdminAnalyticsView',
          exact: true,
          meta: {
            title: 'Analytics',
          },
          path: '/analytics',
        },
      },
      // The `BeforeDashboard` component renders the 'welcome' block that you see after logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeDashboard: ['@/components/BeforeDashboard'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  db: mongooseAdapter({
    url: process.env.DATABASE_URL || '',
    afterCreateConnection: (adapter) => {
      if (!payloadDebug) return

      console.log('[mongo] afterCreateConnection', {
        dbName: adapter.connection.db?.databaseName,
      })
    },
    afterOpenConnection: (adapter) => {
      if (!payloadDebug) return

      mongoose.set('debug', (collectionName, method, query, doc, options) => {
        console.log('[mongo] mongoose', {
          collectionName,
          method,
          query,
          doc,
          options,
        })
      })

      const client = adapter.connection.getClient()
      client.removeAllListeners('commandStarted')
      client.removeAllListeners('commandSucceeded')
      client.removeAllListeners('commandFailed')
      client.on('commandStarted', (event) => {
        if (
          event.commandName === 'insert' ||
          event.commandName === 'update' ||
          event.commandName === 'find'
        ) {
          console.log('[mongo] commandStarted', {
            commandName: event.commandName,
            databaseName: event.databaseName,
            command: event.command,
          })
        }
      })
      client.on('commandSucceeded', (event) => {
        if (
          event.commandName === 'insert' ||
          event.commandName === 'update' ||
          event.commandName === 'find'
        ) {
          console.log('[mongo] commandSucceeded', {
            commandName: event.commandName,
            duration: event.duration,
            reply: event.reply,
          })
        }
      })
      client.on('commandFailed', (event) => {
        console.log('[mongo] commandFailed', {
          commandName: event.commandName,
          duration: event.duration,
          failure: event.failure,
          requestId: event.requestId,
          connectionId: event.connectionId,
        })
      })
    },
  }),
  email: nodemailerAdapter({
    defaultFromAddress: process.env.SMTP_FROM_ADDRESS || 'noreply@liberland.org',
    defaultFromName: process.env.SMTP_FROM_NAME || 'Liberland Marketplace',
    transportOptions: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
  }),
  collections: [
    Pages,
    Posts,
    Media,
    Categories,
    Users,
    Identities,
    Companies,
    Jobs,
    CommentLikes,
    Startups,
    Syndications,
    Reports,
    InformationRequests,
    Subscribers,
    NotificationSubscriptions,
  ],
  cors: '*',
  endpoints: [analyticsConfigEndpoint, backfillEndpoint, confirmCryptoOrderEndpoint],
  globals: [Header, Footer],
  plugins,
  debug: payloadDebug,
  logger: {
    options: {
      level: process.env.PAYLOAD_LOG_LEVEL || 'info',
    },
  },
  secret: payloadSecret,
  sharp,
  typescript: {
    declare: {},
    outputFile: path.resolve(dirname, 'payload-types.ts'),
    schema: [
      ({ jsonSchema }) => {
        const commentsSchema = jsonSchema.definitions?.comments
        if (commentsSchema && 'properties' in commentsSchema) {
          commentsSchema.properties = {
            ...commentsSchema.properties,
            replyCount: {
              type: ['number', 'null'],
            },
            serverUrl: {
              type: ['string', 'null'],
            },
          }
        }

        const commentsSelectSchema = jsonSchema.definitions?.comments_select
        if (commentsSelectSchema && 'properties' in commentsSelectSchema) {
          commentsSelectSchema.properties = {
            ...commentsSelectSchema.properties,
            replyCount: {
              type: 'boolean',
            },
            serverUrl: {
              type: 'boolean',
            },
          }
        }

        return jsonSchema
      },
    ],
  },
  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        // Allow logged in users to execute this endpoint (default)
        if (req.user) return true

        const secret = process.env.CRON_SECRET
        if (!secret) return false

        // If there is no logged in user, then check
        // for the Vercel Cron secret to be present as an
        // Authorization header:
        const authHeader = req.headers.get('authorization')
        return authHeader === `Bearer ${secret}`
      },
    },
    tasks: [],
  },
  graphQL: {
    disable: false,
    disableIntrospectionInProduction: false,
    disablePlaygroundInProduction: false,
    mutations: (graphQL, context) => ({
      ...analyticsGraphQLMutations(graphQL, context),
      ...shareGraphQLMutations(graphQL, context),
      ...sellerOrderGraphQLMutations(graphQL, context),
      ...startupGraphQLMutations(graphQL, context),
      ...userGraphQLMutations(graphQL, context),
    }),
    queries: (graphQL, context) => ({
      ...permissionsGraphQLQueries(graphQL, context),
      ...sellerOrderGraphQLQueries(graphQL, context),
      ...userGraphQLQueries(graphQL, context),
    }),
  },
})
