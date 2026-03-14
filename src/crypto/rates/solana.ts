import { Connection, PublicKey } from '@solana/web3.js'
import { getSolanaRateConfig } from '../env'
import { computePoolRate } from '../math'
import type { ChainPoolRate } from '../types'

export const getSolanaPoolRate = async (): Promise<ChainPoolRate> => {
  const config = getSolanaRateConfig()
  const connection = new Connection(config.rpcUrl, {
    commitment: 'confirmed',
  })

  const [nativeVaultBalance, stableVaultBalance] = await Promise.all([
    connection.getTokenAccountBalance(new PublicKey(config.nativeVaultAddress)),
    connection.getTokenAccountBalance(new PublicKey(config.stableVaultAddress)),
  ])

  const nativeReserveRaw = BigInt(nativeVaultBalance.value.amount)
  const stableReserveRaw = BigInt(stableVaultBalance.value.amount)

  const rate = computePoolRate({
    nativeReserveRaw,
    nativeDecimals: nativeVaultBalance.value.decimals,
    stableReserveRaw,
    stableDecimals: stableVaultBalance.value.decimals,
  })

  return {
    chain: 'solana',
    poolAddress: config.poolAddress,
    nativeSymbol: config.nativeSymbol,
    stableSymbol: config.stableSymbol,
    fetchedAt: Date.now(),
    stablePerNative: rate.stablePerNative,
    nativePerStable: rate.nativePerStable,
  }
}
