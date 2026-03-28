import type { Field } from 'payload'

const adminComponentPathMap = {
  '@payloadcms/plugin-ecommerce/client#PriceCell': '@/components/PayloadEcommerce/PriceCell',
  '@payloadcms/plugin-ecommerce/rsc#PriceInput': '@/components/PayloadEcommerce/PriceInput',
  '@payloadcms/plugin-ecommerce/rsc#VariantOptionsSelector':
    '@/components/PayloadEcommerce/VariantOptionsSelector',
} as const

type ComponentPathConfig =
  | false
  | string
  | {
      path: string
      [key: string]: boolean | number | object | string | undefined
    }

type FieldComponentConfig = {
  Cell?: ComponentPathConfig
  Field?: ComponentPathConfig
  [key: string]: boolean | number | object | string | undefined
}

type MutableField = Field & {
  admin?: {
    components?: FieldComponentConfig
    [key: string]: boolean | number | object | string | undefined
  }
  blocks?: Array<{
    fields: Field[]
    [key: string]: boolean | number | object | string | undefined
  }>
  fields?: Field[]
  tabs?: Array<{
    fields?: Field[]
    [key: string]: boolean | number | object | string | undefined
  }>
  type?: string
}

const replaceComponentPath = <T extends ComponentPathConfig | undefined>(component: T): T => {
  if (typeof component === 'string') {
    const nextPath = adminComponentPathMap[component as keyof typeof adminComponentPathMap]
    return (nextPath ?? component) as T
  }

  if (!component || typeof component.path !== 'string') {
    return component
  }

  const componentWithPath = component as Exclude<ComponentPathConfig, false | string>
  const nextPath =
    adminComponentPathMap[componentWithPath.path as keyof typeof adminComponentPathMap] ??
    componentWithPath.path

  if (nextPath === componentWithPath.path) {
    return component
  }

  return {
    ...componentWithPath,
    path: nextPath,
  } as T
}

const replaceFieldAdminComponentPaths = (field: Field): Field => {
  const nextField = field as MutableField
  const fieldComponents = nextField.admin?.components
  const fieldWithReplacedComponents = fieldComponents
    ? ({
        ...nextField,
        admin: {
          ...nextField.admin,
          components: {
            ...fieldComponents,
            Cell: replaceComponentPath(fieldComponents.Cell),
            Field: replaceComponentPath(fieldComponents.Field),
          },
        },
      } as MutableField)
    : nextField

  if (Array.isArray(fieldWithReplacedComponents.fields)) {
    return {
      ...fieldWithReplacedComponents,
      fields: fieldWithReplacedComponents.fields.map(replaceFieldAdminComponentPaths),
    } as Field
  }

  if (Array.isArray(fieldWithReplacedComponents.blocks)) {
    return {
      ...fieldWithReplacedComponents,
      blocks: fieldWithReplacedComponents.blocks.map((block) => ({
        ...block,
        fields: block.fields.map(replaceFieldAdminComponentPaths),
      })),
    } as Field
  }

  if (fieldWithReplacedComponents.type === 'tabs' && Array.isArray(fieldWithReplacedComponents.tabs)) {
    return {
      ...fieldWithReplacedComponents,
      tabs: fieldWithReplacedComponents.tabs.map((tab) =>
        'fields' in tab && Array.isArray(tab.fields)
          ? {
              ...tab,
              fields: tab.fields.map(replaceFieldAdminComponentPaths),
            }
          : tab,
      ),
    } as Field
  }

  return fieldWithReplacedComponents as Field
}

export const replaceEcommerceAdminComponentPaths = (fields: Field[]): Field[] =>
  fields.map(replaceFieldAdminComponentPaths)
