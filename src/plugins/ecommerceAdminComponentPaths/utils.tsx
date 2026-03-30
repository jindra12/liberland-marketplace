import type { Field } from 'payload'
import type {
  AdminFieldWithNestedComponents,
  AdminComponentConfig,
  EcommerceAdminComponentAliases,
  EcommerceAdminComponentSourcePath,
} from './types'

const hasAlias = (
  path: string,
  aliases: EcommerceAdminComponentAliases,
): path is EcommerceAdminComponentSourcePath => path in aliases

const replaceComponentPath = (
  component: AdminComponentConfig | undefined,
  aliases: EcommerceAdminComponentAliases,
): AdminComponentConfig | undefined => {
  if (!component) {
    return component
  }

  if (typeof component === 'string') {
    return hasAlias(component, aliases) ? aliases[component] : component
  }

  if (!hasAlias(component.path, aliases)) {
    return component
  }

  return {
    ...component,
    path: aliases[component.path],
  }
}

export const applyAdminComponentPathAliases = ({
  aliases,
  field,
}: {
  aliases: EcommerceAdminComponentAliases
  field: Field
}): Field => {
  const nextField = field as Field & AdminFieldWithNestedComponents
  const fieldComponents = nextField.admin?.components
  const fieldWithAliasedComponents = fieldComponents
    ? {
        ...nextField,
        admin: {
          ...nextField.admin,
          components: {
            ...fieldComponents,
            Cell: replaceComponentPath(fieldComponents.Cell, aliases),
            Field: replaceComponentPath(fieldComponents.Field, aliases),
          },
        },
      }
    : nextField

  if (fieldWithAliasedComponents.fields) {
    return {
      ...fieldWithAliasedComponents,
      fields: fieldWithAliasedComponents.fields.map((nestedField) =>
        applyAdminComponentPathAliases({
          aliases,
          field: nestedField as Field,
        }),
      ),
    } as Field
  }

  if (fieldWithAliasedComponents.blocks) {
    return {
      ...fieldWithAliasedComponents,
      blocks: fieldWithAliasedComponents.blocks.map((block) => ({
        ...block,
        fields: block.fields.map((nestedField) =>
          applyAdminComponentPathAliases({
            aliases,
            field: nestedField as Field,
          }),
        ),
      })),
    } as Field
  }

  if (fieldWithAliasedComponents.type === 'tabs' && fieldWithAliasedComponents.tabs) {
    return {
      ...fieldWithAliasedComponents,
      tabs: fieldWithAliasedComponents.tabs.map((tab) =>
        tab.fields
          ? {
              ...tab,
              fields: tab.fields.map((nestedField) =>
                applyAdminComponentPathAliases({
                  aliases,
                  field: nestedField as Field,
                }),
              ),
            }
          : tab,
      ),
    } as Field
  }

  return fieldWithAliasedComponents as Field
}
