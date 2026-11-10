import { vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import type { Order, Product, User } from '@/payload-types'

export const createInventoryFixture = (role: User['role'] = ['admin']) => {
  const payload = mockDeep<Payload>()
  const req = mockDeep<PayloadRequest>()
  const user = mock<User & { collection: 'users' }>({ id: 'operator', role, collection: 'users' })
  const inventory = { value: 10 }
  req.payload = payload
  req.user = user
  payload.auth.mockResolvedValue(mock<Awaited<ReturnType<Payload['auth']>>>({ user }))
  payload.findByID.mockImplementation(async (options) => {
    if (options.collection === 'orders') {
      return Object.assign(mock<Order>(), {
        id: String(options.id),
        status: 'completed',
        items: [{ product: 'product', quantity: 2 }],
      })
    }
    return Object.assign(mock<Product>(), {
      id: 'product',
      inventory: inventory.value,
      unlimitedInventory: false,
    })
  })
  payload.update.mockImplementation(async (options) => {
    if (
      options.collection === 'products' &&
      'inventory' in options.data &&
      typeof options.data.inventory === 'number'
    ) {
      inventory.value = options.data.inventory
    }
    return mock<Product>({ id: 'product', inventory: inventory.value })
  })
  vi.mocked(getPayload).mockResolvedValue(payload)
  vi.mocked(createLocalReq).mockResolvedValue(req)
  return { payload, inventory }
}
