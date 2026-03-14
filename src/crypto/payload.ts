import type { Payload } from 'payload'

let payloadPromise: Promise<Payload> | null = null

export const getPayloadInstance = async () => {
  if (!payloadPromise) {
    payloadPromise = (async () => {
      const [{ getPayload }, { default: config }] = await Promise.all([
        import('payload'),
        import('@payload-config'),
      ])

      return getPayload({ config })
    })()
  }

  return payloadPromise
}
