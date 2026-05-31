export type MaybeID = null | number | string | { id?: unknown }

export const toStringID = (value: MaybeID | unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)

  if (value && typeof value === 'object' && 'id' in value) {
    const id = value.id

    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }

  return null
}
