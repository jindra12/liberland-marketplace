import type { PayloadRequest } from 'payload'

type RequestWithIP = PayloadRequest & {
  ip?: string
}

const getRequestIP = (req: PayloadRequest): string => {
  return (req as RequestWithIP).ip || 'unknown'
}

export const getAnalyticsRequestMetadata = (req: PayloadRequest) => {
  return {
    ip: getRequestIP(req),
    origin: req.headers.get('origin') || null,
    referer: req.headers.get('referer') || null,
    userAgent: req.headers.get('user-agent') || null,
  }
}
