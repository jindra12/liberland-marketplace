import type { ArrayField, Field } from 'payload'

import { onlyOwnProductsOrAdminFilter } from '@/access/onlyOwnProductsOrAdmin'
import { mergeFields } from '@/utilities/mergeFields'
import { TEXT_INPUT_MAX_LENGTH } from './constants'

type ParameterMode = 'default' | 'selected'

type ParameterValueRow = {
  default?: boolean | null
  key?: string | null
  name?: string | null
  selected?: boolean | null
}

const isArrayFieldWithName = (
  field: Field,
  name: string,
): field is Field & { name: string; type: 'array'; fields: Field[] } =>
  typeof field === 'object' &&
  field !== null &&
  'name' in field &&
  field.name === name &&
  'type' in field &&
  field.type === 'array' &&
  'fields' in field &&
  Array.isArray(field.fields)

const getBooleanFieldName = (mode: ParameterMode): 'default' | 'selected' =>
  mode === 'default' ? 'default' : 'selected'

const getBooleanFieldLabel = (mode: ParameterMode): string => (mode === 'default' ? 'Default' : 'Selected')

const createParameterValueSelectionValidator =
  (booleanFieldName: 'default' | 'selected'): ArrayField['validate'] =>
  (value) => {
    if (!Array.isArray(value)) {
      return true
    }

    const selectedCount = value.filter((row) => {
      if (!row || typeof row !== 'object') {
        return false
      }

      return (row as ParameterValueRow)[booleanFieldName] === true
    }).length

    return selectedCount <= 1 || `Only one ${booleanFieldName} value can be selected per parameter.`
  }

const createParameterValuesField = (mode: ParameterMode): Field => {
  const booleanFieldName = getBooleanFieldName(mode)

  return {
    name: 'values',
    type: 'array',
    admin: {
      initCollapsed: true,
    },
    fields: [
      {
        name: 'key',
        type: 'text',
        required: true,
        maxLength: TEXT_INPUT_MAX_LENGTH,
      },
      {
        name: 'name',
        type: 'text',
        required: true,
        maxLength: TEXT_INPUT_MAX_LENGTH,
      },
      {
        name: booleanFieldName,
        label: getBooleanFieldLabel(mode),
        type: 'checkbox',
        defaultValue: false,
      },
    ],
    label: 'Possible Values',
    validate: createParameterValueSelectionValidator(booleanFieldName),
  }
}

const createParametersField = (mode: ParameterMode): Field => ({
  name: 'parameters',
  type: 'array',
  admin: {
    initCollapsed: true,
  },
    fields: [
      {
        name: 'name',
        type: 'text',
        required: true,
        maxLength: TEXT_INPUT_MAX_LENGTH,
      },
      createParameterValuesField(mode),
    ],
  label: 'Parameters',
})

export const productParametersField = createParametersField('default')

export const cartOrderParametersField = createParametersField('selected')

export const relatedProductsField: Field = {
  name: 'relatedProducts',
  type: 'relationship',
  admin: {
    position: 'sidebar',
  },
  filterOptions: onlyOwnProductsOrAdminFilter,
  hasMany: true,
  label: 'Related Products',
  relationTo: 'products',
}

export const appendParametersToItemsField = (fields: Field[]): Field[] =>
  fields.map((field) => {
    if (!isArrayFieldWithName(field, 'items')) {
      if (typeof field === 'object' && field !== null && 'tabs' in field && Array.isArray(field.tabs)) {
        return {
          ...field,
          tabs: field.tabs.map((tab) => ({
            ...tab,
            fields: Array.isArray(tab.fields) ? appendParametersToItemsField(tab.fields) : [],
          })),
        } as Field
      }

      if ('fields' in field && Array.isArray(field.fields)) {
        return {
          ...field,
          fields: appendParametersToItemsField(field.fields),
        }
      }

      return field
    }

    return {
      ...field,
      fields: mergeFields(field.fields, [cartOrderParametersField]),
    }
  })
