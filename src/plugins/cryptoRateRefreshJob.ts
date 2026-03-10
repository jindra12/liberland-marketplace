import type { Config } from 'payload'
import { startCryptoRateRefreshScheduler } from '@/crypto/rates/cache'

export const cryptoRateRefreshJob = (config: Config): Config => {
  const existingOnInit = config.onInit

  return {
    ...config,
    onInit: async (payload) => {
      if (existingOnInit) {
        await existingOnInit(payload)
      }

      await startCryptoRateRefreshScheduler({ payload })
    },
  }
}

