import type { CollectionBeforeChangeHook } from 'payload'

import { getServerSideURL } from '@/utilities/getURL'

export const setCommentServerUrl: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  const next = { ...(data ?? {}) }

  if (operation === 'update' && originalDoc && typeof originalDoc.serverUrl === 'string') {
    next.serverUrl = originalDoc.serverUrl
    return next
  }

  next.serverUrl = getServerSideURL()

  return next
}
