import { APIError, CollectionBeforeChangeHook } from 'payload'

export const requireVerifiedEmailToPublish: CollectionBeforeChangeHook = ({
  data,
  req,
}) => {
  // Local API calls (no user) and admins bypass
  if (!req.user) return data
  if (req.user.role?.includes('admin')) return data

  // Only block when setting status to published
  if (data?._status !== 'published') return data

  if (!req.user.emailVerified) {
    throw new APIError('You must verify your email before publishing.', 403)
  }

  return data
}
