import { assertUrlIsSafeToFetch, isGuardedFetchError } from 'guarded-fetch'

export const resolveSafeURL = async (value: string): Promise<URL | null> => {
  try {
    return (await assertUrlIsSafeToFetch(value, { opaqueErrors: true })).url
  } catch (error) {
    if (isGuardedFetchError(error)) {
      return null
    }
    throw error
  }
}
