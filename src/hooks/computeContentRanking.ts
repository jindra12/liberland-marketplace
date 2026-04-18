import type { CollectionBeforeChangeHook } from 'payload'

type RankingSource = {
  completenessScore?: number | null
  contentRankScore?: number | null
  createdAt?: string | Date | null
  lastLikeAt?: string | Date | null
  likeCount?: number | null
  publishedAt?: string | Date | null
  purchaseCount?: number | null
  subscriberCount?: number | null
  updatedAt?: string | Date | null
}

type ContentRankingHookConfig = {
  fieldPaths: string[]
  includeSubscriberCount?: boolean
}

const MS_PER_HOUR = 60 * 60 * 1000
const HALF_LIFE_HOURS = 72

const getFieldValue = (source: Record<string, unknown> | undefined, path: string): unknown => {
  if (!source) {
    return undefined
  }

  return path.split('.').reduce<unknown>((current, part) => {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }

    return (current as Record<string, unknown>)[part]
  }, source)
}

const isFilled = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    return /\S/.test(value)
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  return true
}

const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizeDateValue = (value: Date | null): string | null => {
  return value ? value.toISOString() : null
}

export const calculateContentRankScore = ({
  completenessScore,
  createdAt,
  lastLikeAt,
  likeCount,
  publishedAt,
  purchaseCount,
  subscriberCount,
  updatedAt,
  now = new Date(),
}: RankingSource & {
  now?: Date
}): number => {
  const likesSignal = Math.log1p(Math.max(0, likeCount ?? 0))
  const purchaseSignal = Math.log1p(Math.max(0, purchaseCount ?? 0))
  const subscriberSignal = Math.log1p(Math.max(0, subscriberCount ?? 0))
  const completionSignal = Math.max(0, completenessScore ?? 0)
  const freshestSignalDate =
    toDate(lastLikeAt) ?? toDate(publishedAt) ?? toDate(createdAt) ?? toDate(updatedAt)

  const recencySignal =
    freshestSignalDate === null
      ? 0
      : Math.exp(-((now.getTime() - freshestSignalDate.getTime()) / MS_PER_HOUR) / HALF_LIFE_HOURS)

  return (
    likesSignal * 3 +
    purchaseSignal * 4 +
    subscriberSignal * 2 +
    completionSignal * 1.25 +
    recencySignal * 5
  )
}

export const computeContentRanking =
  ({
    fieldPaths,
    includeSubscriberCount = true,
  }: ContentRankingHookConfig): CollectionBeforeChangeHook =>
  ({ data, originalDoc }) => {
    const source = {
      ...(originalDoc && typeof originalDoc === 'object' ? (originalDoc as Record<string, unknown>) : {}),
      ...(data && typeof data === 'object' ? (data as Record<string, unknown>) : {}),
    }

    const completenessScore = fieldPaths.reduce((score, path) => {
      return score + (isFilled(getFieldValue(source, path)) ? 1 : 0)
    }, 0)

    const nextRankScore = calculateContentRankScore({
      completenessScore,
      createdAt: source.createdAt as string | Date | null | undefined,
      lastLikeAt: source.lastLikeAt as string | Date | null | undefined,
      likeCount: typeof source.likeCount === 'number' ? source.likeCount : null,
      publishedAt: source.publishedAt as string | Date | null | undefined,
      purchaseCount: typeof source.purchaseCount === 'number' ? source.purchaseCount : null,
      subscriberCount: typeof source.subscriberCount === 'number' ? source.subscriberCount : null,
      updatedAt: source.updatedAt as string | Date | null | undefined,
    })

    return {
      ...data,
      completenessScore,
      contentRankScore: nextRankScore,
      lastLikeAt: normalizeDateValue(toDate(source.lastLikeAt as string | Date | null | undefined)),
      ...(includeSubscriberCount
        ? {
            subscriberCount: typeof source.subscriberCount === 'number' ? source.subscriberCount : 0,
          }
        : {}),
    }
  }
