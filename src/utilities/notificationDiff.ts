import type { Field } from 'payload'
import { formatLabels, fieldAffectsData } from 'payload/shared'

import { renderItemUpdateEmailHTML } from '@/emails/renderItemUpdateEmailHTML'
import type { Company, Identity, Job, Product, Startup } from '@/payload-types'
import {
  NOTIFICATION_TARGET_FRONTEND_PATHS,
  NOTIFICATION_TARGET_LABELS,
  type NotificationTargetCollection,
} from '@/newsletter/constants'
import { getFrontendURL } from '@/utilities/getURL'

export type NotificationChange = {
  after: string
  before: string
  label: string
  path: string
}

type NotificationTargetDoc = Company | Identity | Job | Product | Startup
type DiffValue = Date | DiffObject | DiffValue[] | boolean | null | number | string | undefined

interface DiffObject {
  [key: string]: DiffValue
}

const EXCLUDED_TOP_LEVEL_FIELDS = new Set([
  'companyIdentityId',
  'completenessScore',
  'createdAt',
  'createdBy',
  'id',
  'itemCount',
  'serverURL',
  'updatedAt',
])

const isRecord = (value: DiffValue): value is DiffObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)

const isRelationshipRecord = (value: DiffObject): boolean => {
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every((key) => key === 'id' || key === 'relationTo' || key === 'value')
}

const normalizeScalar = (value: DiffValue): string => {
  if (typeof value === 'undefined' || value === null) return '(empty)'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value.length > 0 ? value : '(empty)'
  return String(value)
}

const getDefaultFieldLabel = (name: string): string => formatLabels(name).singular

const getTopLevelFieldName = (path: string): string | null => {
  const [topLevelSegment] = path.split('.')
  const topLevelFieldName = topLevelSegment?.replace(/\[\d+\]/g, '')

  return topLevelFieldName && topLevelFieldName.length > 0 ? topLevelFieldName : null
}

const getTopLevelField = ({
  fields,
  path,
}: {
  fields: Field[]
  path: string
}): Field | null => {
  const topLevelFieldName = getTopLevelFieldName(path)

  if (!topLevelFieldName) {
    return null
  }

  return (
    fields.find((candidate) => fieldAffectsData(candidate) && candidate.name === topLevelFieldName) ??
    null
  )
}

const shouldExcludeNotificationPath = ({
  fields,
  path,
}: {
  fields: Field[]
  path: string
}): boolean => {
  const topLevelFieldName = getTopLevelFieldName(path)

  if (!topLevelFieldName) {
    return false
  }

  if (EXCLUDED_TOP_LEVEL_FIELDS.has(topLevelFieldName)) {
    return true
  }

  const field = getTopLevelField({ fields, path })

  if (!field) {
    return false
  }

  const isFieldHidden = 'hidden' in field && field.hidden === true
  const isAdminHidden =
    typeof field.admin === 'object' &&
    field.admin !== null &&
    'hidden' in field.admin &&
    field.admin.hidden === true
  const isAdminReadOnly =
    typeof field.admin === 'object' &&
    field.admin !== null &&
    'readOnly' in field.admin &&
    field.admin.readOnly === true

  return isFieldHidden || isAdminHidden || isAdminReadOnly
}

const getNotificationChangeLabel = ({
  fields,
  path,
}: {
  fields: Field[]
  path: string
}): string => {
  const field = getTopLevelField({ fields, path })
  const topLevelFieldName = getTopLevelFieldName(path)

  if (!topLevelFieldName) {
    return path
  }

  if (field && 'label' in field && typeof field.label === 'string' && field.label.length > 0) {
    return field.label
  }

  return getDefaultFieldLabel(topLevelFieldName)
}

const flattenRecord = (
  record: DiffObject | NotificationTargetDoc,
  bucket: Map<string, string>,
  prefix = '',
): void => {
  Object.entries(record).forEach(([key, value]) => {
    if (!prefix && EXCLUDED_TOP_LEVEL_FIELDS.has(key)) {
      return
    }

    const path = prefix ? `${prefix}.${key}` : key

    if (Array.isArray(value)) {
      if (value.length === 0) {
        bucket.set(path, '[]')
        return
      }

      value.forEach((entry, index) => {
        if (isRecord(entry)) {
          flattenRecord(entry, bucket, `${path}[${index}]`)
          return
        }

        bucket.set(`${path}[${index}]`, normalizeScalar(entry))
      })
      return
    }

    if (isRecord(value)) {
      if (isRelationshipRecord(value)) {
        bucket.set(path, normalizeScalar(value.value ?? value.id))
        return
      }

      flattenRecord(value, bucket, path)
      return
    }

    bucket.set(path, normalizeScalar(value))
  })
}

export const collectDocumentChanges = ({
  fields,
  nextDoc,
  previousDoc,
}: {
  fields: Field[]
  nextDoc: NotificationTargetDoc
  previousDoc: NotificationTargetDoc
}): NotificationChange[] => {
  const nextValues = new Map<string, string>()
  const previousValues = new Map<string, string>()

  flattenRecord(nextDoc, nextValues)
  flattenRecord(previousDoc, previousValues)

  return Array.from(new Set([...nextValues.keys(), ...previousValues.keys()]))
    .sort((left, right) => left.localeCompare(right))
    .filter((path) => !shouldExcludeNotificationPath({ fields, path }))
    .map((path) => ({
      after: nextValues.get(path) || '(empty)',
      before: previousValues.get(path) || '(empty)',
      label: getNotificationChangeLabel({ fields, path }),
      path,
    }))
    .filter((change) => change.after !== change.before)
}

export const buildFrontendDocumentURL = ({
  collection,
  id,
}: {
  collection: NotificationTargetCollection
  id: string
}): string =>
  new URL(`/${NOTIFICATION_TARGET_FRONTEND_PATHS[collection]}/${id}`, getFrontendURL()).toString()

export const getNotificationDocumentTitle = ({
  collection,
  doc,
}: {
  collection: NotificationTargetCollection
  doc: NotificationTargetDoc
}): string => {
  const title =
    collection === 'companies' || collection === 'identities' || collection === 'products'
      ? ('name' in doc ? doc.name : '')
      : ('title' in doc ? doc.title : '')
  return title || `${NOTIFICATION_TARGET_LABELS[collection]} ${doc.id}`
}

const renderItemUpdateEmailText = ({
  eyebrow,
  documentURL,
  changes,
  collectionLabel,
  intro,
  title,
  unsubscribeURL,
}: {
  eyebrow?: string
  documentURL: string
  changes: NotificationChange[]
  collectionLabel: string
  intro?: string
  title: string
  unsubscribeURL: string
}): string => {
  const visibleChanges = changes.slice(0, 20)
  const remainingChanges = changes.length - visibleChanges.length
  const eyebrowText = eyebrow ?? `${collectionLabel} updated`
  const introText =
    intro ?? `A subscribed ${collectionLabel.toLowerCase()} changed. Here is what moved.`

  return [
    `${eyebrowText}: ${title}`,
    '',
    introText,
    '',
    `View in marketplace: ${documentURL}`,
    '',
    ...visibleChanges.map(
      (change) =>
        `${change.label}\n- Before: ${change.before}\n- After: ${change.after}`,
    ),
    remainingChanges > 0 ? `${remainingChanges} more change(s) not shown.` : '',
    '',
    `Unsubscribe: ${unsubscribeURL}`,
  ]
    .filter((line) => line.length > 0)
    .join('\n\n')
}

export const renderItemUpdateEmail = async ({
  eyebrow,
  changes,
  collection,
  docID,
  intro,
  title,
  unsubscribeURL,
}: {
  eyebrow?: string
  changes: NotificationChange[]
  collection: NotificationTargetCollection
  docID: string
  intro?: string
  title: string
  unsubscribeURL: string
}): Promise<{ html: string; text: string }> => {
  const collectionLabel = NOTIFICATION_TARGET_LABELS[collection]
  const documentURL = buildFrontendDocumentURL({ collection, id: docID })
  const html = await renderItemUpdateEmailHTML({
    eyebrow,
    documentURL,
    changes,
    collectionLabel,
    intro,
    title,
    unsubscribeURL,
  })
  const text = renderItemUpdateEmailText({
    eyebrow,
    documentURL,
    changes,
    collectionLabel,
    intro,
    title,
    unsubscribeURL,
  })

  return {
    html,
    text,
  }
}
