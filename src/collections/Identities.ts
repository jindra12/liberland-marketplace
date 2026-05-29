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
import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

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
