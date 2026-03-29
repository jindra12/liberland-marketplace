export type EcommerceAdminComponentSourcePath =
  | '@payloadcms/plugin-ecommerce/client#PriceCell'
  | '@payloadcms/plugin-ecommerce/rsc#PriceInput'
  | '@payloadcms/plugin-ecommerce/rsc#VariantOptionsSelector'

export type EcommerceAdminComponentTargetPath =
  | '@/components/PayloadEcommerce/PriceCell'
  | '@/components/PayloadEcommerce/PriceInput'
  | '@/components/PayloadEcommerce/VariantOptionsSelector'

export type EcommerceAdminComponentAliases = Readonly<
  Record<EcommerceAdminComponentSourcePath, EcommerceAdminComponentTargetPath>
>

export type AdminComponentConfigValue = boolean | number | object | string

export type AdminComponentConfig =
  | false
  | string
  | {
      path: string
      [key: string]: AdminComponentConfigValue | undefined
    }

export type AdminFieldComponentConfig = {
  Cell?: AdminComponentConfig
  Field?: AdminComponentConfig
  [key: string]: AdminComponentConfig | AdminComponentConfigValue | undefined
}

export type AdminFieldBlock = {
  fields: AdminFieldWithNestedComponents[]
}

export type AdminFieldTab = {
  fields?: AdminFieldWithNestedComponents[]
}

export type AdminFieldWithNestedComponents = {
  admin?: {
    components?: AdminFieldComponentConfig
  }
  blocks?: AdminFieldBlock[]
  fields?: AdminFieldWithNestedComponents[]
  tabs?: AdminFieldTab[]
  type?: string
}
