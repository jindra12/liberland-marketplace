export const getCronSecret = (): string | undefined => process.env.CRON_SECRET

export const isCronAuthorized = (request: Request): boolean => {
  const secret = getCronSecret()
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}
