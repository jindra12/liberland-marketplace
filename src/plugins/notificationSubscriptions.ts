import type { CollectionBeforeDeleteHook, Plugin, Where } from 'payload'
import { NOTIFICATION_TARGET_OPTIONS } from '@/newsletter/constants'

const removeNotificationSubscriptions: CollectionBeforeDeleteHook = async ({
  id,
  collection,
  req,
}) => {
  const where: Where =
    collection.slug === 'users'
      ? { createdBy: { equals: id } }
      : { targetCollection: { equals: collection.slug }, targetID: { equals: String(id) } }
  await req.payload.delete({
    collection: 'notification-subscriptions',
    where,
    overrideAccess: true,
    req,
  })
}

/** Remove delivery permissions before deleting their account or destination. */
export const notificationCleanupPlugin: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) => {
    if (
      collection.slug !== 'users' &&
      !NOTIFICATION_TARGET_OPTIONS.some((target) => target.value === collection.slug)
    ) {
      return collection
    }
    return {
      ...collection,
      fields: [
        ...collection.fields,
        ...(['companies', 'jobs', 'products', 'startups'].includes(collection.slug)
          ? [
              {
                name: 'publicationNotifiedAt',
                type: 'date' as const,
                hidden: true,
                access: { create: () => false, update: () => false },
              },
            ]
          : []),
      ],
      hooks: {
        ...collection.hooks,
        beforeDelete: [...(collection.hooks?.beforeDelete || []), removeNotificationSubscriptions],
      },
    }
  }),
})
