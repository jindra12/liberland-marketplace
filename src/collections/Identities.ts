import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { completenessScoreField } from '@/fields/completenessScoreField'
import { markdownField } from '@/fields/markdownField'
import { notificationSubscriberCountField } from '@/fields/notificationSubscriberCountField'
import { notificationSubscriptionStatusField } from '@/fields/notificationSubscriptionStatusField'
import { serverURLField } from '@/fields/serverURLField'
import { computeContentRanking } from '@/hooks/computeContentRanking'
import { lazySendItemUpdateNotifications } from '@/hooks/lazyCollectionHooks'
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin'
import type { CollectionConfig } from 'payload'

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
    create: authenticated,
    delete: onlyOwnDocsOrAdmin,
    read: anyone,
    update: onlyOwnDocsOrAdmin,
  },
  hooks: {
    beforeChange: [
      computeContentRanking({
        fieldPaths: ['website', 'image', 'description'],
      }),
    ],
    afterChange: [lazySendItemUpdateNotifications('identities')],
  },
  fields: [
    serverURLField(),
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
