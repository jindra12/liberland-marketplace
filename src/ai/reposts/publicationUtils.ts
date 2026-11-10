import { createHash } from 'node:crypto'

export const buildAiPublicationKey = (companyID: string, source: string): string => {
  const url = new URL(source)
  url.hash = ''
  return createHash('sha256')
    .update(JSON.stringify([companyID, url.href]))
    .digest('hex')
}
