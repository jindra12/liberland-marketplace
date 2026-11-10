import type { PayloadRequest } from 'payload'

export const getAnalyticsRequestMetadata = (req: PayloadRequest & { ip?: string }) => {
  return {
    ip: req.ip,
    origin: req.headers.get('origin') || null,
    referer: req.headers.get('referer') || null,
    userAgent: req.headers.get('user-agent') || null,
  }
}
