import { anyone } from '@/access/anyone'
import { completenessScoreField } from '@/fields/completenessScoreField'
import { createdByField } from '@/fields/createdByField'
import { markdownField } from '@/fields/markdownField'
import { notificationSubscriberCountField } from '@/fields/notificationSubscriberCountField'
import { notificationSubscriptionStatusField } from '@/fields/notificationSubscriptionStatusField'
import { serverURLField } from '@/fields/serverURLField'
import { computeContentRanking } from '@/hooks/computeContentRanking'
import { lazySendItemUpdateNotifications } from '@/hooks/lazyCollectionHooks'
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin'
import { adminOnly } from '@/access/admin'
import { ObjectId } from 'mongodb'
import type {
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  PayloadRequest,
} from 'payload'

type LegacyIdentityDocument = {
  _id: ObjectId
  [key: string]: unknown
}

type LegacyIdentityCollection = {
  findOne: (filter: { _id: ObjectId }) => Promise<LegacyIdentityDocument | null>
}

type IdentityLookupArgs = {
  args: {
    data?: Record<string, unknown>
    id?: number | string
  }
  operation: 'findByID'
  req: PayloadRequest
}

const populateIdentityID: CollectionBeforeValidateHook = (args) => {
  if (args.operation !== 'create') {
    return args.data
  }

  if (args.data?.id) {
    return args.data
  }

  return {
    ...args.data,
    id: new ObjectId().toHexString(),
  }
}

const findLegacyIdentityByMongoID = async ({
  id,
  req,
}: {
  id: string
  req: PayloadRequest
}): Promise<LegacyIdentityDocument | null> => {
  const collection = req.payload.db.collections.identities?.collection as LegacyIdentityCollection | undefined

  if (!collection || !ObjectId.isValid(id)) {
    return null
  }

  try {
    return await collection.findOne({ _id: new ObjectId(id) })
  } catch {
    return null
  }
}

const resolveLegacyIdentityByMongoID: CollectionBeforeOperationHook = async (args) => {
  if (args.operation !== 'findByID') {
    return undefined
  }

  const lookupArgs = args as IdentityLookupArgs
  const id = typeof lookupArgs.args.id === 'string' ? lookupArgs.args.id : null
  if (!id) {
    return undefined
  }

  const legacyDoc = await findLegacyIdentityByMongoID({
    id,
    req: lookupArgs.req,
  })

  if (!legacyDoc) {
    return undefined
  }

  lookupArgs.args.data = {
    ...legacyDoc,
    id,
  }

  return undefined
}

export const Identities: CollectionConfig = {
  slug: 'identities',
  labels: {
    singular: 'Tribe',
    plural: 'Tribes',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Directory',
    defaultColumns: ['name', 'website', 'company'],
  },
  defaultSort: '-contentRankScore',
  access: {
    create: adminOnly,
    delete: onlyOwnDocsOrAdmin,
    read: anyone,
    update: onlyOwnDocsOrAdmin,
  },
  hooks: {
    beforeValidate: [populateIdentityID],
    beforeOperation: [resolveLegacyIdentityByMongoID],
    beforeChange: [
      computeContentRanking({
        fieldPaths: ['website', 'image', 'description'],
      }),
    ],
    afterChange: [lazySendItemUpdateNotifications('identities')],
  },
  fields: [
    createdByField,
    serverURLField(),
    {
      name: 'id',
      label: 'Tribe ID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Use this ID when sharing a tribe from another nSwap server.',
      },
    },
    { name: 'name', type: 'text', required: true },
    { name: 'website', type: 'text' },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
    markdownField({
      name: 'description',
      label: 'Description',
    }),
    {
      name: 'itemCount',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: {
        hidden: true,
        readOnly: true,
      },
      access: {
        create: () => false,
        update: () => false,
      },
    },
    notificationSubscriberCountField(),
    notificationSubscriptionStatusField('identities'),
    completenessScoreField,
  ],
}
