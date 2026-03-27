import type { Config } from 'payload'

export const cryptoRateRefreshJob = (config: Config): Config => {
  const existingOnInit = config.onInit

  return {
    ...config,
    onInit: async (payload) => {
      if (existingOnInit) {
        await existingOnInit(payload)
      }

      const { startCryptoRateRefreshScheduler } = await import('@/crypto/rates/cache')
      await startCryptoRateRefreshScheduler({ payload })
    },
  }
}
