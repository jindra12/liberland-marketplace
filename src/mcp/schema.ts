import config from '@payload-config'
import type { Field } from 'payload'
import { getEntityDefinition } from './catalog'
import type { McpJsonValue } from './types'

type FieldSchema = {
  name: string
  type: string
  required: boolean
  hasMany?: boolean
  relationTo?: string | string[]
  options?: McpJsonValue[]
  maxLength?: number
  fields?: FieldSchema[]
}

type PermissionSchema = {
  configured: boolean
  description: string
}

const toOptions = (options: unknown): McpJsonValue[] | undefined => {
  if (!Array.isArray(options)) return undefined
  return options.map((option) => {
    if (typeof option === 'string') return option
    if (typeof option === 'object' && option !== null && 'value' in option) {
      const value = option.value
      return typeof value === 'string' || typeof value === 'number' ? value : String(value)
    }
    return String(option)
  })
}

const toFieldSchema = (field: Field): FieldSchema | null => {
  if (!('name' in field) || typeof field.name !== 'string') return null

  const result: FieldSchema = {
    name: field.name,
    type: field.type,
    required: Boolean('required' in field && field.required),
  }

  if ('hasMany' in field && typeof field.hasMany === 'boolean') result.hasMany = field.hasMany
  if ('relationTo' in field && (typeof field.relationTo === 'string' || Array.isArray(field.relationTo))) result.relationTo = field.relationTo
  if ('options' in field) result.options = toOptions(field.options)
  if ('maxLength' in field && typeof field.maxLength === 'number') result.maxLength = field.maxLength
  if ('fields' in field && Array.isArray(field.fields)) result.fields = field.fields.map(toFieldSchema).filter((entry): entry is FieldSchema => Boolean(entry))

  return result
}

const permission = (configured: unknown, operation: string): PermissionSchema => ({
  configured: Boolean(configured),
  description: `Payload access control is enforced for ${operation}; this metadata does not grant permission.`,
})

export const getPayloadEntitySchema = async (entity: Parameters<typeof getEntityDefinition>[0]) => {
  const resolvedConfig = await config
  const collectionSlug = getEntityDefinition(entity).collection
  const collection = resolvedConfig.collections?.find((entry) => entry.slug === collectionSlug)
  if (!collection) return null

  const access = collection.access ?? {}
  const authEnabled = Boolean(collection.auth)

  return {
    collection: collection.slug,
    createFields: collection.fields.map(toFieldSchema).filter((entry): entry is FieldSchema => Boolean(entry)),
    updateFields: collection.fields.map((field) => {
      const schema = toFieldSchema(field)
      return schema ? { ...schema, required: false } : null
    }).filter((entry): entry is FieldSchema => Boolean(entry)),
    permissions: {
      requiresAuthentication: authEnabled,
      create: permission(access.create, 'create'),
      read: permission(access.read, 'read'),
      update: permission(access.update, 'update'),
      delete: permission(access.delete, 'delete'),
    },
  }
}
