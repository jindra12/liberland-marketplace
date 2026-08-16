import config from '@payload-config'
import { getPayloadAuth } from 'payload-auth/better-auth'

let payloadAuthPromise: ReturnType<typeof getPayloadAuth> | null = null

export const getPayloadAuthInstance = async () => {
  if (!payloadAuthPromise) {
    payloadAuthPromise = getPayloadAuth(config)
  }

  return payloadAuthPromise
}
