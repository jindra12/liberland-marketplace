import { APIError, type CollectionBeforeChangeHook, type PayloadRequest } from 'payload'

export const canBypassVerifiedEmailCheck = (req: PayloadRequest): boolean => {
  if (!req.user) {
    return true
  }

  if (req.user.role?.includes('admin')) {
    return true
  }

  return Boolean(req.user.emailVerified)
}

export const requireVerifiedEmail = (
  req: PayloadRequest,
  errorMessage: string,
): void => {
  if (canBypassVerifiedEmailCheck(req)) {
    return
  }

  throw new APIError(errorMessage, 403)
}

export const requireVerifiedEmailToCreate: CollectionBeforeChangeHook = ({
  operation,
  req,
  data,
}) => {
  if (operation !== 'create') {
    return data
  }

  requireVerifiedEmail(req, 'You must verify your email before commenting.')

  return data
}
