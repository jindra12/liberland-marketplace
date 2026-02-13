import config from '@payload-config'
import { getPayloadAuth } from 'payload-auth/better-auth'

const payloadAuth = await getPayloadAuth(config)

export const { GET, POST } = {
  GET: (req: Request) => payloadAuth.betterAuth.handler(req),
  POST: (req: Request) => payloadAuth.betterAuth.handler(req),
}
