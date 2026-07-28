import type { DateField, Field, NumberField } from 'payload'

type ContentRankingFieldOptions = {
  includeSubscriberCount?: boolean
}

const hiddenFieldAdmin = {
  hidden: true,
  readOnly: true,
} as const

const lastLikeAtField: DateField = {
  name: 'lastLikeAt',
  type: 'date',
  admin: hiddenFieldAdmin,
  access: {
    create: () => false,
    update: () => false,
  },
}

const subscriberCountField: NumberField = {
  name: 'subscriberCount',
  type: 'number',
  defaultValue: 0,
  index: true,
  admin: hiddenFieldAdmin,
  access: {
    create: () => false,
    update: () => false,
  },
}

const contentRankScoreField: NumberField = {
  name: 'contentRankScore',
  type: 'number',
  defaultValue: 0,
  index: true,
  admin: hiddenFieldAdmin,
  access: {
    create: () => false,
    update: () => false,
  },
}

export const createContentRankingFields = (
  options: ContentRankingFieldOptions = {},
): Field[] => {
  const fields: Field[] = [lastLikeAtField]

  if (options.includeSubscriberCount !== false) {
    fields.push(subscriberCountField)
  }

  fields.push(contentRankScoreField)

  return fields
}
