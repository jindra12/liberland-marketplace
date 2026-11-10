import { describe, expect, it } from 'vitest'
import { analyticsTrackInputSchema } from '@/utilities/analytics/tracking'

describe('Public analytics input budgets', () => {
  it.each([
    {
      label: 'oversized metadata value',
      input: { type: 'page_view', metadata: { text: 'x'.repeat(65537) } },
    },
    {
      label: 'excessive metadata keys',
      input: {
        type: 'page_view',
        metadata: Object.fromEntries(
          Array.from({ length: 1001 }, (_, index) => [`field${index}`, index]),
        ),
      },
    },
    { label: 'unbounded event name', input: { type: 'x'.repeat(10001) } },
    { label: 'unbounded route', input: { type: 'page_view', route: `/${'x'.repeat(10001)}` } },
  ])('rejects $label before storage', (fixture) => {
    expect(analyticsTrackInputSchema.safeParse(fixture.input).success).toBe(false)
  })

  it('accepts an ordinary page-view event', () => {
    expect(
      analyticsTrackInputSchema.safeParse({
        type: 'page_view',
        route: '/companies',
        metadata: { source: 'navigation' },
      }).success,
    ).toBe(true)
  })
})
