import { createHash } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'

const toOrderReferenceSeed = (orderId: string): Buffer => createHash('sha256').update(orderId).digest()

export const getSolanaOrderReference = (orderId: string): PublicKey => {
  return new PublicKey(toOrderReferenceSeed(orderId))
}
