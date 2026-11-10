import { describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { PayloadRequest } from 'payload'
import type { Order, Transaction } from '@/payload-types'
import { verifyTransactionOccurred } from '@/crypto'
import { cryptoAdapter } from '@/payments/cryptoAdapter'

vi.mock('@/crypto', () => ({ verifyTransactionOccurred: vi.fn() }))

describe('Retryable payment confirmation', () => {
  it.each(['Transaction was not found.', 'Missing transaction hash entry for product second.'])(
    'does not cancel an order on a retryable verification result: %s',
    async (error) => {
      const req = mockDeep<PayloadRequest>()
      req.payload.findByID.mockResolvedValue(
        Object.assign(mock<Order>(), {
          id: 'order',
          customer: 'buyer',
          customerEmail: 'buyer@example.test',
          amount: 1000,
          items: [],
          paymentProofs: [],
          paymentTargets: [],
          transactions: [],
        }),
      )
      req.payload.create.mockResolvedValue(mock<Transaction>({ id: 'transaction' }))
      vi.mocked(verifyTransactionOccurred).mockResolvedValue({
        orderId: 'order',
        ok: false,
        error,
        results: [],
      })

      await expect(
        cryptoAdapter().confirmOrder({ data: { orderID: 'order' }, req }),
      ).rejects.toThrow(error)
      expect(req.payload.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'orders',
          data: expect.objectContaining({ status: 'cancelled' }),
        }),
      )
    },
  )
})
