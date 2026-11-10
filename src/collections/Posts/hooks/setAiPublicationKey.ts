import type { CollectionBeforeChangeHook } from 'payload'
import type { Post } from '@/payload-types'
import { buildAiPublicationKey } from '@/ai/reposts/publicationUtils'
import { toStringID } from '@/utilities/toStringID'

export const setAiPublicationKey: CollectionBeforeChangeHook<Post> = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation === 'update') {
    return { ...data, aiPublicationKey: originalDoc?.aiPublicationKey }
  }
  const companyID = toStringID(data.company)
  return {
    ...data,
    aiPublicationKey:
      req.user?.bot && companyID && data.repost
        ? buildAiPublicationKey(companyID, data.repost)
        : undefined,
  }
}
