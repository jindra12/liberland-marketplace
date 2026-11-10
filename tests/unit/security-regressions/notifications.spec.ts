import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import type { Company, Product } from '@/payload-types'
import { sendItemUpdateNotifications } from '@/hooks/sendItemUpdateNotifications'
import { sendOrderCompletedNotifications } from '@/hooks/sendOrderCompletedNotifications'
import { buildFrontendDocumentURL } from '@/utilities/notificationDiff'

const { getRecipients, buildEmail, sendEmails } = vi.hoisted(() => ({
  getRecipients: vi.fn(async () => []),
  buildEmail: vi.fn(async () => ({ html: '', text: '' })),
  sendEmails: vi.fn(),
}))
vi.mock('@/newsletter/notificationSubscriptions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/newsletter/notificationSubscriptions')>()),
  getNotificationRecipientsForTarget: getRecipients,
  buildNotificationSubscriptionUnsubscribeURL: vi.fn(),
}))
vi.mock('@/hooks/notificationEmails', () => ({
  buildNotificationEmail: buildEmail,
  sendNotificationEmails: sendEmails,
}))

describe('Publication and purchase notifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not look up subscribers or email draft-only company edits', async () => {
    const req = mockDeep<PayloadRequest>()
    req.payload.config.collections = []
    const previousDoc = { id: 'company', name: 'Public name', _status: 'published' as const }
    const doc = { id: 'company', name: 'Confidential draft', _status: 'draft' as const }
    await sendItemUpdateNotifications('companies')(
      Object.assign(mock<Parameters<CollectionAfterChangeHook<Company>>[0]>(), {
        req,
        operation: 'update',
        previousDoc,
        doc,
      }),
    )
    expect(getRecipients).not.toHaveBeenCalled()
  })

  it('notification links contain the source-qualified canonical company path', () => {
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', 'https://frontend.example')
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
    expect(buildFrontendDocumentURL({ collection: 'companies', id: 'company' })).toBe(
      `https://frontend.example/companies/company/${Buffer.from('https://backend.example').toString('hex')}`,
    )
  })

  it('formats an order amount stored in cents as dollars in the notification', async () => {
    const req = mockDeep<PayloadRequest>()
    req.payload.findByID.mockResolvedValue(
      mock<Product>({ company: mock<Company>({ email: 'seller@example.test' }) }),
    )
    await sendOrderCompletedNotifications(
      Object.assign(mock<Parameters<CollectionAfterChangeHook>[0]>(), {
        req,
        operation: 'update',
        previousDoc: { status: 'processing' },
        doc: {
          id: 'order',
          amount: 1234,
          status: 'completed',
          items: [{ product: 'product' }],
          customerEmail: 'buyer@example.test',
        },
      }),
    )
    expect(buildEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.arrayContaining([{ label: 'Amount', value: '12.34' }]),
      }),
    )
  })

  it('notifies the buyer as well as the seller when an order completes', async () => {
    const req = mockDeep<PayloadRequest>()
    req.payload.findByID.mockResolvedValue(
      mock<Product>({ company: mock<Company>({ email: 'seller@example.test' }) }),
    )
    await sendOrderCompletedNotifications(
      Object.assign(mock<Parameters<CollectionAfterChangeHook>[0]>(), {
        req,
        operation: 'update',
        previousDoc: { status: 'processing' },
        doc: {
          id: 'order',
          amount: 1234,
          status: 'completed',
          items: [{ product: 'product' }],
          customerEmail: 'buyer@example.test',
        },
      }),
    )
    expect(sendEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: expect.arrayContaining(['seller@example.test', 'buyer@example.test']),
      }),
    )
  })
})
