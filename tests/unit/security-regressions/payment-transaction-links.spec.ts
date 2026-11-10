import { describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { PayloadRequest } from 'payload'
import type { Order, Transaction } from '@/payload-types'
import { verifyTransactionOccurred } from '@/crypto'
import { cryptoAdapter } from '@/payments/cryptoAdapter'

vi.mock('@/crypto', () => ({ verifyTransactionOccurred: vi.fn() }))

describe('Payment confirmation transaction linkage', () => {
  it('does not create a second transaction when caller visibility hides an existing payment record', async () => {
    const req = mockDeep<PayloadRequest>()
    req.payload.findByID.mockResolvedValue(
      mock<Order>({
        id: 'order',
        customer: 'buyer',
        customerEmail: 'buyer@example.test',
        amount: 1000,
        items: [],
        transactions: [],
      }),
    )
    req.payload.find.mockResolvedValue({
      docs: [mock<Transaction>({ id: 'existing-transaction', order: 'order' })],
      totalDocs: 1,
      totalPages: 1,
      page: 1,
      hasNextPage: false,
      hasPrevPage: false,
      limit: 1,
      pagingCounter: 1,
    })
    req.payload.create.mockResolvedValue(mock<Transaction>({ id: 'duplicate-transaction' }))
    req.payload.update.mockResolvedValue(mock<Transaction>({ id: 'existing-transaction' }))
    vi.mocked(verifyTransactionOccurred).mockResolvedValue({
      orderId: 'order',
      ok: true,
      results: [],
    })
    await cryptoAdapter().confirmOrder({ data: { orderID: 'order' }, req })
    expect(req.payload.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'transactions' }),
    )
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'orders',
        data: expect.objectContaining({ transactions: ['existing-transaction'] }),
      }),
    )
  })
})
