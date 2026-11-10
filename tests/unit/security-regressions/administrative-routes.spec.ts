import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import type { User } from '@/payload-types'
import { NextRequest } from 'next/server'
import { POST as seed } from '@/app/(frontend)/next/seed/route'
import { GET as preview } from '@/app/(frontend)/next/preview/route'

const { seedDatabase, enableDraft, redirect } = vi.hoisted(() => ({
  seedDatabase: vi.fn(),
  enableDraft: vi.fn(),
  redirect: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/endpoints/seed', () => ({ seed: seedDatabase }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  draftMode: async () => ({ enable: enableDraft, disable: vi.fn() }),
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: vi.fn(),
  createLocalReq: vi.fn(),
}))

describe('Administrative route authorization', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not let a regular account run destructive database seeding', async () => {
    const payload = mockDeep<Payload>()
    payload.auth.mockResolvedValue(
      mock<Awaited<ReturnType<Payload['auth']>>>({
        user: mock<User & { collection: 'users' }>({
          id: 'mallory',
          role: ['user'],
          collection: 'users',
        }),
      }),
    )
    vi.mocked(getPayload).mockResolvedValue(payload)
    vi.mocked(createLocalReq).mockResolvedValue(mockDeep<PayloadRequest>())
    const response = await seed()
    expect({ status: response.status, seedCalls: seedDatabase.mock.calls.length }).toEqual({
      status: 403,
      seedCalls: 0,
    })
  })

  it('does not enable preview mode when authentication returns a null user', async () => {
    const payload = mockDeep<Payload>()
    payload.auth.mockResolvedValue(mock<Awaited<ReturnType<Payload['auth']>>>({ user: null }))
    vi.mocked(getPayload).mockResolvedValue(payload)
    vi.stubEnv('PREVIEW_SECRET', 'unit-test-preview-secret')
    await preview(
      new NextRequest(
        'https://backend.example/next/preview?path=/draft&collection=posts&slug=draft&previewSecret=unit-test-preview-secret',
      ),
    )
    expect(enableDraft).not.toHaveBeenCalled()
  })

  it('does not redirect preview requests to a different origin using a protocol-relative path', async () => {
    const payload = mockDeep<Payload>()
    payload.auth.mockResolvedValue(
      mock<Awaited<ReturnType<Payload['auth']>>>({
        user: mock<User & { collection: 'users' }>({
          id: 'editor',
          role: ['admin'],
          collection: 'users',
        }),
      }),
    )
    vi.mocked(getPayload).mockResolvedValue(payload)
    vi.stubEnv('PREVIEW_SECRET', 'unit-test-preview-secret')
    await preview(
      new NextRequest(
        'https://backend.example/next/preview?path=//attacker.example&collection=posts&slug=draft&previewSecret=unit-test-preview-secret',
      ),
    )
    expect(redirect).not.toHaveBeenCalledWith('//attacker.example')
  })
})
