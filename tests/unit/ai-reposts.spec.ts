import { describe, expect, it } from 'vitest'
import chunk from 'lodash/chunk'

import type { AiRepostCompany } from '@/ai/reposts/types'
import { AI_REPOST_BATCH_SIZE } from '@/ai/reposts/constants'

describe('ai repost batching', () => {
  it('chunks companies into batches of 20', () => {
    const companies = Array.from({ length: 21 }, (_, index) => {
      return {
        id: `company-${index + 1}`,
        name: `Company ${index + 1}`,
      } satisfies AiRepostCompany
    })

    const chunks = chunk(companies, AI_REPOST_BATCH_SIZE)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(20)
    expect(chunks[1]).toHaveLength(1)
    expect(chunks[0][0]?.id).toBe('company-1')
    expect(chunks[0][19]?.id).toBe('company-20')
    expect(chunks[1][0]?.id).toBe('company-21')
  })
})
