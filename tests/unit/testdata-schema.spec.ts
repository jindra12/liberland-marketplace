import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import type { CollectionConfig } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { searchPlugin } from '@payloadcms/plugin-search'

import { addCreatedBy } from '@/plugins/addCreatedBy'
import { comments } from '@/plugins/comments'
import { likesPlugin } from '@/plugins/likes'
import { marketplaceEcommercePlugin } from '@/plugins/ecommerce'
import { searchFields } from '@/search/fieldOverrides'
import { defaultLexical } from '@/fields/defaultLexical'
import { Categories } from '@/collections/Categories'
import { Companies } from '@/collections/Companies'
import { Identities } from '@/collections/Identities'
import { InformationRequests } from '@/collections/InformationRequests'
import { Jobs } from '@/collections/Jobs'
import { Media } from '@/collections/Media'
import { NotificationSubscriptions } from '@/collections/NotificationSubscriptions'
import { Pages } from '@/collections/Pages'
import { Posts } from '@/collections/Posts'
import { Reports } from '@/collections/Reports'
import { Startups } from '@/collections/Startups'
import { Subscribers } from '@/collections/Subscribers'
import { Syndications } from '@/collections/Syndications'
import { Users } from '@/collections/Users'
import { sanitizeConfig } from 'payload'
import type { SanitizedConfig } from 'payload'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { configToJSONSchema } from '../../node_modules/payload/dist/utilities/configToJSONSchema.js'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonArray | JsonObject
type JsonArray = JsonValue[]
type JsonObject = {
  [key: string]: JsonValue
}

const isJsonObject = (value: JsonValue): value is JsonObject => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type FixtureDocument = JsonObject & {
  __v?: JsonValue
  _id?: JsonValue
  id?: JsonValue
  price?: JsonValue
}

type FixtureMapping = {
  fileName: string
  collectionSlug: string
}

const testdataDir = path.resolve(process.cwd(), 'testdata')
const testdata1Dir = path.resolve(process.cwd(), 'testdata1')
const fixtureDirectories = [testdataDir, testdata1Dir]

const fixtureUsersCollection = {
  ...Users,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'email',
      type: 'email',
      required: true,
    },
    {
      name: 'emailVerified',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'role',
      type: 'select',
      hasMany: true,
      options: [
        {
          label: 'User',
          value: 'user',
        },
        {
          label: 'Admin',
          value: 'admin',
        },
      ],
      defaultValue: ['user'],
      required: true,
    },
    ...(Users.fields ?? []),
  ],
} satisfies CollectionConfig

const fixtureAccountsCollection = {
  slug: 'accounts',
  fields: [
    {
      name: 'accountId',
      type: 'text',
      required: true,
    },
    {
      name: 'providerId',
      type: 'text',
      required: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'password',
      type: 'text',
      required: true,
    },
  ],
  timestamps: true,
} satisfies CollectionConfig

const fixtureMappings: FixtureMapping[] = [
  { fileName: 'addresses.json', collectionSlug: 'addresses' },
  { fileName: 'carts.json', collectionSlug: 'carts' },
  { fileName: 'accounts.json', collectionSlug: 'accounts' },
  { fileName: 'comment-likes.json', collectionSlug: 'comment-likes' },
  { fileName: 'comments.json', collectionSlug: 'comments' },
  { fileName: 'companies.json', collectionSlug: 'companies' },
  { fileName: 'company-likes.json', collectionSlug: 'company-likes' },
  { fileName: 'form-submissions.json', collectionSlug: 'form-submissions' },
  { fileName: 'forms.json', collectionSlug: 'forms' },
  { fileName: 'identities.json', collectionSlug: 'identities' },
  { fileName: 'identity-likes.json', collectionSlug: 'identity-likes' },
  { fileName: 'information-requests.json', collectionSlug: 'information-requests' },
  { fileName: 'job-likes.json', collectionSlug: 'job-likes' },
  { fileName: 'jobs.json', collectionSlug: 'jobs' },
  { fileName: 'media.json', collectionSlug: 'media' },
  {
    fileName: 'notification-subscriptions.json',
    collectionSlug: 'notification-subscriptions',
  },
  { fileName: 'orders.json', collectionSlug: 'orders' },
  { fileName: 'pages.json', collectionSlug: 'pages' },
  { fileName: 'post-likes.json', collectionSlug: 'post-likes' },
  { fileName: 'posts.json', collectionSlug: 'posts' },
  { fileName: 'product-likes.json', collectionSlug: 'product-likes' },
  { fileName: 'products.json', collectionSlug: 'products' },
  { fileName: 'redirects.json', collectionSlug: 'redirects' },
  { fileName: 'reports.json', collectionSlug: 'reports' },
  { fileName: 'searches.json', collectionSlug: 'search' },
  { fileName: 'startups.json', collectionSlug: 'startups' },
  { fileName: 'subscribers.json', collectionSlug: 'subscribers' },
  { fileName: 'syndications.json', collectionSlug: 'syndications' },
  { fileName: 'transactions.json', collectionSlug: 'transactions' },
  { fileName: 'users.json', collectionSlug: 'users' },
  { fileName: 'venture-likes.json', collectionSlug: 'venture-likes' },
]

const normalizeFixtureValue = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(normalizeFixtureValue)
  }

  if (typeof value !== 'object' || value === null) {
    return value
  }

  if ('$oid' in value && typeof value.$oid === 'string' && Object.keys(value).length === 1) {
    return value.$oid
  }

  if ('$date' in value && typeof value.$date === 'string' && Object.keys(value).length === 1) {
    return value.$date
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, normalizeFixtureValue(entryValue as JsonValue)]),
  ) as JsonObject
}

const normalizeFixtureDocument = (collectionSlug: string, document: JsonObject): JsonObject => {
  const normalized = normalizeFixtureValue(document) as JsonObject
  const id =
    '_id' in normalized && typeof normalized._id === 'string'
      ? normalized._id
      : null

  const nextDocument: FixtureDocument = {
    ...normalized,
    id: id ?? normalized.id,
  }

  delete nextDocument._id
  delete nextDocument.__v

  if (collectionSlug === 'products') {
    delete nextDocument.price
  }

  return nextDocument
}

const buildFixtureConfig = async (): Promise<SanitizedConfig> => {
  const baseConfig: Config = {
    admin: {},
    editor: defaultLexical,
    collections: [
      Pages,
      Posts,
      Media,
      Categories,
      fixtureUsersCollection,
      fixtureAccountsCollection,
      Identities,
      Companies,
      Jobs,
      Startups,
      Syndications,
      Reports,
      InformationRequests,
      Subscribers,
      NotificationSubscriptions,
    ],
    db: (() => {
      const fixtureDb = mongooseAdapter({
        url: 'mongodb://127.0.0.1:27017/liberland',
      })

      fixtureDb.defaultIDType = 'text'
      return fixtureDb
    })(),
    secret: 'test-secret',
  }

  const withComments = await comments(baseConfig)
  const withCreatedBy = addCreatedBy(withComments)
  const withLikes = await likesPlugin(withCreatedBy)
  const withEcommerce = await marketplaceEcommercePlugin(withLikes)
  const withRedirects = await redirectsPlugin({
    collections: ['pages', 'posts'],
  })(withEcommerce)
  const withForms = await formBuilderPlugin({
    fields: {
      payment: false,
    },
  })(withRedirects)
  const withSearch = await searchPlugin({
    collections: ['jobs', 'companies', 'identities', 'products', 'startups', 'posts'],
    searchOverrides: {
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
      admin: {
        group: 'Directory',
      },
    },
  })(withForms)

  return await sanitizeConfig(withSearch)
}

const buildValidators = async () => {
  const sanitizedConfig = await buildFixtureConfig()
  const schema = configToJSONSchema(sanitizedConfig, sanitizedConfig.db?.defaultIDType)
  const ajv = new Ajv({
    allErrors: true,
  })
  const normalizedDefinitions = normalizeSchemaNode(schema.definitions ?? {})

  return fixtureMappings.reduce<Map<string, ValidateFunction>>((validators, mapping) => {
    const collectionDefinition = isJsonObject(normalizedDefinitions)
      ? normalizedDefinitions[mapping.collectionSlug]
      : null

    if (!isJsonObject(collectionDefinition)) {
      throw new Error(`Missing JSON schema definition for "${mapping.collectionSlug}".`)
    }

    const validator = ajv.compile({
      ...collectionDefinition,
      definitions: isJsonObject(normalizedDefinitions) ? normalizedDefinitions : {},
    })

    validators.set(mapping.fileName, validator)
    return validators
  }, new Map())
}

describe('testdata schema', () => {
  it('matches the current Payload collection schemas', async () => {
    const mappedFiles = fixtureMappings.map((mapping) => mapping.fileName).sort()

    const validators = await buildValidators()
    const allDocumentIDs: string[] = []

    fixtureDirectories.forEach((fixtureDir) => {
      const testdataFiles = readdirSync(fixtureDir)
        .filter((fileName) => fileName.endsWith('.json'))
        .sort()

      expect(testdataFiles).toEqual(mappedFiles)

      fixtureMappings.forEach((mapping) => {
        const filePath = path.join(fixtureDir, mapping.fileName)
        const rawDocs = JSON.parse(readFileSync(filePath, 'utf8')) as JsonArray

        expect(Array.isArray(rawDocs)).toBe(true)

        rawDocs.forEach((doc, index) => {
          if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
            throw new Error(`Expected ${mapping.fileName}[${index}] to be an object document.`)
          }

          const normalizedDoc = normalizeFixtureDocument(mapping.collectionSlug, doc)
          const validator = validators.get(mapping.fileName)

          if (!validator) {
            throw new Error(`Missing validator for "${mapping.fileName}".`)
          }

          if (typeof normalizedDoc.id === 'string') {
            allDocumentIDs.push(normalizedDoc.id)
          }

          const isValid = validator(normalizedDoc)
          if (!isValid) {
            throw new Error(
              `${mapping.fileName}[${index}] failed validation for "${mapping.collectionSlug}": ${ajvErrorText(
                validator.errors,
              )}\n${JSON.stringify(validator.errors, null, 2)}`,
            )
          }
        })
      })
    })

    expect(new Set(allDocumentIDs).size).toBe(allDocumentIDs.length)
  })
})

const ajvErrorText = (errors: ErrorObject[] | null | undefined) =>
  new Ajv().errorsText(errors ?? [], {
    separator: '\n',
  })

const normalizeSchemaNode = (node: JsonValue): JsonValue => {
  if (Array.isArray(node)) {
    return node.map(normalizeSchemaNode)
  }

  if (typeof node !== 'object' || node === null) {
    return node
  }

  const nextNode: JsonObject = Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, normalizeSchemaNode(value as JsonValue)]),
  )

  const normalizeRelationBranch = (branch: JsonValue): JsonValue => {
    if (typeof branch !== 'object' || branch === null || Array.isArray(branch)) {
      return branch
    }

    if (!('type' in branch)) {
      return branch
    }

    const nextBranch: JsonObject = { ...branch }
    const fieldType = nextBranch.type

    if (fieldType === 'number') {
      nextBranch.type = 'string'
    } else if (Array.isArray(fieldType)) {
      nextBranch.type = fieldType.map((entry) => (entry === 'number' ? 'string' : entry))
    }

    return nextBranch
  }

  ;(['oneOf', 'anyOf', 'allOf'] as const).forEach((key) => {
    const branches = nextNode[key]
    if (!Array.isArray(branches)) {
      return
    }

    const hasReferenceBranch = branches.some(
      (branch) => typeof branch === 'object' && branch !== null && !Array.isArray(branch) && '$ref' in branch,
    )

    if (!hasReferenceBranch) {
      return
    }

    nextNode[key] = branches.map(normalizeRelationBranch) as JsonArray
  })

  return nextNode
}
