import type { UIFieldServerComponent } from 'payload'

import './index.scss'

import type { NotificationTargetCollection } from '@/newsletter/constants'

const isNotificationTargetCollection = (
  value: string,
): value is NotificationTargetCollection =>
  value === 'companies' ||
  value === 'identities' ||
  value === 'jobs' ||
  value === 'products' ||
  value === 'startups'

const NotificationSubscriberCountField: UIFieldServerComponent = async ({
  collectionSlug,
  id,
  req,
}) => {
  const count =
    id && isNotificationTargetCollection(collectionSlug)
      ? await (async () => {
          const { getNotificationSubscriberCountForTarget } = await import(
            '@/newsletter/notificationSubscriptions'
          )

          return getNotificationSubscriberCountForTarget({
            req,
            targetCollection: collectionSlug,
            targetID: String(id),
          })
        })()
      : 0

  return (
    <div className="notification-subscriber-count-field">
      <div className="notification-subscriber-count-field__label">Number of subscribers</div>
      <div className="notification-subscriber-count-field__value">{count}</div>
    </div>
  )
}

export default NotificationSubscriberCountField
