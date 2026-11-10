import { APIError, type Field, type FieldHookArgs } from 'payload'
import type { Startup } from '@/payload-types'
import { updateAtomically } from '@/utilities/atomicUpdates/utils'
import { toStringID } from '@/utilities/toStringID'

export const ventureMembershipField = (): Field => ({
  name: 'involvedUsers',
  label: 'Involved Users',
  type: 'relationship',
  relationTo: 'users',
  hasMany: true,
  hooks: {
    beforeChange: [
      async ({
        operation,
        value,
        originalDoc,
        siblingData,
        req,
      }: FieldHookArgs<Startup, Startup['involvedUsers'], Partial<Startup>>) => {
        if (operation !== 'update' || !Array.isArray(value)) {
          return value
        }
        const previous = (originalDoc!.involvedUsers || [])
          .map(toStringID)
          .filter((id): id is string => Boolean(id))
        const requested = value.map(toStringID).filter((id): id is string => Boolean(id))
        const added = requested.filter((id) => !previous.includes(id))
        const removed = previous.filter((id) => !requested.includes(id))
        await Promise.all(
          added.map((id) =>
            req.payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true, req }),
          ),
        )
        if (requested.length !== value.length) {
          throw new APIError('Every member must have a valid user ID.', 400)
        }
        if (added.length || removed.length) {
          await updateAtomically({
            collection: 'startups',
            id: originalDoc!.id,
            req,
            update: (current) => {
              const members = (current.involvedUsers || [])
                .map(toStringID)
                .filter((id): id is string => Boolean(id))
              return {
                involvedUsers: Array.from(
                  new Set([...members.filter((id) => !removed.includes(id)), ...added]),
                ),
              }
            },
          })
        }
        // Apply the user's changes, not a stale replacement of the entire membership list.
        delete siblingData.involvedUsers
        return undefined
      },
    ],
  },
})
