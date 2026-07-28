import type { NavPreferences, PayloadRequest } from 'payload'
import { cache } from 'react'

const isNavPreferences = (value: object): value is NavPreferences => 'groups' in value && 'open' in value

export const getNavPrefs = cache(async (req?: PayloadRequest): Promise<NavPreferences | null> => {
  if (!req?.user?.collection) {
    return null
  }

  const result = await req.payload.find({
    collection: 'payload-preferences',
    depth: 0,
    limit: 1,
    pagination: false,
    req,
    where: {
      and: [
        {
          key: {
            equals: 'nav',
          },
        },
        {
          'user.relationTo': {
            equals: req.user.collection,
          },
        },
        {
          'user.value': {
            equals: req.user.id,
          },
        },
      ],
    },
  })

  const preferenceValue = result.docs[0]?.value

  if (!preferenceValue || typeof preferenceValue !== 'object') {
    return null
  }

  return isNavPreferences(preferenceValue) ? preferenceValue : null
})
