import { APIError } from 'payload'
import type { CollectionBeforeChangeHook } from 'payload'

const toId = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }
  return null
}

export const validateInvolvedUsers: CollectionBeforeChangeHook = ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  if (operation !== 'update') return data
  if (!req.user) return data
  if (req.user.role?.includes('admin')) return data

  const next = { ...(data ?? {}) }

  // If involvedUsers wasn't included in the update, nothing to validate
  if (!('involvedUsers' in next)) return next

  const oldIds = new Set(
    ((originalDoc?.involvedUsers as unknown[]) ?? []).map(toId).filter(Boolean) as string[],
  )
  const newIds = new Set(
    ((next.involvedUsers as unknown[]) ?? []).map(toId).filter(Boolean) as string[],
  )

  const userId = req.user.id as string

  const added = [...newIds].filter((id) => !oldIds.has(id))
  const removed = [...oldIds].filter((id) => !newIds.has(id))

  if (added.some((id) => id !== userId) || removed.some((id) => id !== userId)) {
    throw new APIError('You can only add or remove yourself from involved users.', 403)
  }

  return next
}
