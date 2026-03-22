import type { Field } from 'payload'

export const notificationSubscriberCountField = (): Field => ({
  name: 'numberOfSubscribers',
  type: 'ui',
  admin: {
    components: {
      Field: '@/components/NotificationSubscriberCountField',
    },
    disableBulkEdit: true,
    disableListColumn: true,
  },
})
