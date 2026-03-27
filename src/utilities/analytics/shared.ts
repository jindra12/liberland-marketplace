import type { PayloadRequest } from 'payload'

const getRequestIP = (req: PayloadRequest): string => {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const real = req.headers.get('x-real-ip')?.trim()
  const direct = (req as PayloadRequest & { ip?: string }).ip

  return forwarded || real || direct || 'unknown'
}

export const getAnalyticsRequestMetadata = (req: PayloadRequest) => {
  return {
    ip: getRequestIP(req),
    origin: req.headers.get('origin') || null,
    referer: req.headers.get('referer') || null,
    userAgent: req.headers.get('user-agent') || null,
  }
}
