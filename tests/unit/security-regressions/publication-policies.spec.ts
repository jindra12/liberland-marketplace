import { describe, expect, it } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { CollectionBeforeValidateHook, PayloadRequest } from 'payload'
import type { Syndication } from '@/payload-types'
import { Pages } from '@/collections/Pages'
import { Syndications } from '@/collections/Syndications'

describe('Public publication policies', () => {
  it('does not grant anonymous readers unrestricted access to unpublished pages', async () => {
    const req = mockDeep<PayloadRequest>()
    req.user = null
    const read = Pages.access?.read
    if (!read) {
      throw new Error('Missing actual page read policy')
    }
    expect(await read({ req })).not.toBe(true)
  })

  it('does not let anonymous syndication proposals preselect automatic trust', async () => {
    const req = mockDeep<PayloadRequest>()
    req.user = null
    const hook = Syndications.hooks?.beforeValidate?.[0]
    if (!hook) {
      throw new Error('Missing actual syndication proposal validation hook')
    }
    const result = await hook(
      Object.assign(mock<Parameters<CollectionBeforeValidateHook<Syndication>>[0]>(), {
        req,
        operation: 'create',
        data: {
          name: 'Untrusted directory entry',
          url: 'https://untrusted.example',
          autoEnable: true,
        },
      }),
    )
    expect(result).toMatchObject({ _status: 'draft', autoEnable: false })
  })
})
