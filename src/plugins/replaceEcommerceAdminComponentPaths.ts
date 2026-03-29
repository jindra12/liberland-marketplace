import type { Field } from 'payload'
import { ecommerceAdminComponentAliases } from './ecommerceAdminComponentPaths/constants'
import { applyAdminComponentPathAliases } from './ecommerceAdminComponentPaths/utils'

export const replaceEcommerceAdminComponentPaths = (fields: Field[]): Field[] =>
  fields.map((field) =>
    applyAdminComponentPathAliases({
      aliases: ecommerceAdminComponentAliases,
      field,
    }),
  )
