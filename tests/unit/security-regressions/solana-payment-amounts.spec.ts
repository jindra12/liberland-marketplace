import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  type TransactionResponse,
} from '@solana/web3.js'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { PaginatedDocs, Payload } from 'payload'
import type { Order } from '@/payload-types'
import type { OrderWithPaymentProofs } from '@/crypto/order'
import { getPayloadInstance } from '@/crypto/payload'
import { getSolanaOrderReference } from '@/crypto/verification/solanaReference'
import { verifyTransactionOccurred } from '@/crypto/verification'
// Collect the real SDK-backed verifier before timing payment-validation assertions.
import '@/crypto/verification/solanaPay'

vi.mock('@/crypto/payload', () => ({ getPayloadInstance: vi.fn() }))

describe('Solana payment amount validation', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    { name: 'a missing locked exchange rate', prices: [] },
    {
      name: 'a nonnumeric locked exchange rate',
      prices: [{ chain: 'solana', nativePerStable: 'NaN' }],
    },
    {
      name: 'a finite quote that is greater than the transfer',
      prices: [{ chain: 'solana', nativePerStable: '1' }],
    },
  ])('rejects a one-lamport payment with $name', async (input) => {
    vi.stubEnv('CRYPTO_SOL_RPC_URL', 'https://solana-rpc.example')
    const payer = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey
    const recipient = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey
    const reference = getSolanaOrderReference('order')
    const transfer = SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports: 1 })
    transfer.keys.push({ pubkey: reference, isSigner: false, isWritable: false })
    const transaction = new Transaction({
      feePayer: payer,
      recentBlockhash: SystemProgram.programId.toBase58(),
    }).add(transfer)
    const message = transaction.compileMessage()
    const rpcResponse: TransactionResponse = {
      slot: 1,
      blockTime: Math.floor(Date.now() / 1000),
      transaction: { message, signatures: ['1'.repeat(64)] },
      meta: {
        err: null,
        fee: 5000,
        preBalances: message.accountKeys.map((key) => (key.equals(payer) ? 1000000000 : 0)),
        postBalances: message.accountKeys.map((key) =>
          key.equals(payer) ? 999994999 : key.equals(recipient) ? 1 : 0,
        ),
      },
    }
    const rpc = vi.spyOn(Connection.prototype, 'getTransaction').mockResolvedValue(rpcResponse)
    const payload = mockDeep<Payload>()
    vi.mocked(getPayloadInstance).mockResolvedValue(payload)
    payload.find.mockResolvedValue(Object.assign(mock<PaginatedDocs<Order>>(), { docs: [] }))
    payload.findByID.mockResolvedValue(
      Object.assign(mock<OrderWithPaymentProofs>(), {
        id: 'order',
        createdAt: new Date(Date.now() - 10000).toISOString(),
        paymentProofs: [{ product: 'product', chain: 'solana', transactionHash: '1'.repeat(64) }],
        paymentTargets: [
          {
            productID: 'product',
            chain: 'solana',
            recipientAddress: recipient.toBase58(),
            normalizedRecipientAddress: recipient.toBase58(),
            quantity: 1,
            unitAmount: 10,
            stableAmount: 10,
          },
        ],
        cryptoPrices: input.prices.map((price) => ({
          ...price,
          fetchedAt: new Date(Date.now() - 10000).toISOString(),
        })),
      }),
    )

    const result = await verifyTransactionOccurred('order')

    if (input.name === 'a finite quote that is greater than the transfer') {
      expect(rpc).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ commitment: 'finalized' }),
      )
    } else {
      expect(rpc).not.toHaveBeenCalled()
    }
    expect(result).toMatchObject({ ok: false })
  })
})
