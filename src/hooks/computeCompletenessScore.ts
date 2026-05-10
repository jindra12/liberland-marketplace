import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Creates a beforeChange hook that computes a completenessScore based on
 * which optional fields are filled in. The score is stored in the DB so
 * it can be used for defaultSort ordering.
 *
 * @param fieldPaths - dot-notation paths to check (e.g. 'image', 'salaryRange.min')
 */
export const computeCompletenessScore = (
  fieldPaths: string[],
): CollectionBeforeChangeHook => {
  return ({ data }) => {
    let score = 0

    for (const path of fieldPaths) {
      const value = getNestedValue(data, path)
      if (isFilled(value)) {
        score++
      }
    }

    return { ...data, completenessScore: score }
  }
}

const getNestedValue = (obj: Record<string, unknown> | undefined, path: string): unknown => {
  if (!obj) return undefined
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

const isFilled = (value: unknown): boolean => {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return true
  return true
}
