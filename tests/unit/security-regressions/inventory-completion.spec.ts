import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/orders/[id]/update-inventory/route'
import { createInventoryFixture } from './inventory/utils'

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: vi.fn(),
  createLocalReq: vi.fn(),
}))

describe('Inventory completion integrity', () => {
  it('does not allow a regular customer to invoke administrative inventory completion', async () => {
    const fixture = createInventoryFixture(['user'])
    const response = await POST(
      new Request('https://backend.example/api/orders/order/update-inventory', { method: 'POST' }),
    )
    expect(response.status).toBe(403)
    expect(fixture.payload.update).not.toHaveBeenCalled()
  })
})
