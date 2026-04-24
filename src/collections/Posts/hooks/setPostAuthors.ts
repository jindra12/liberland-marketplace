import type { CollectionBeforeChangeHook } from 'payload'

const getUserID = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return null
}

export const setPostAuthors: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation !== 'create') {
    return data
  }

  const userID = getUserID(req.user?.id)

  if (!userID) {
    return data
  }

  return {
    ...(data ?? {}),
    authors: [userID],
  }
}
