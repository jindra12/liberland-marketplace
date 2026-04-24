import { onlyOwnDocsOrAdminFilter } from '@/access/onlyOwnDocsOrAdmin'
import { completenessScoreField } from '@/fields/completenessScoreField'
import { cryptoAddressesField } from '@/fields/cryptoAddressesField'
import { markdownField } from '@/fields/markdownField'
import { notificationSubscriberCountField } from '@/fields/notificationSubscriberCountField'
import { notificationSubscriptionStatusField } from '@/fields/notificationSubscriptionStatusField'
import { serverURLField } from '@/fields/serverURLField'
import { mergeFields } from '@/utilities/mergeFields'
import type {
  CheckboxField,
  Condition,
  Field,
  NumberField,
  NumberFieldSingleValidation,
} from 'payload'

const readonlyCryptoPriceField = ({
  label,
  name,
}: {
  label: string
  name: string
}): Field => ({
  name,
  type: 'text',
  virtual: true,
  access: {
    create: () => false,
    update: () => false,
  },
  admin: {
    hidden: true,
    readOnly: true,
  },
  label,
})

const unlimitedInventoryFieldName = 'unlimitedInventory'

type ProductInventoryData = {
  enableVariants?: boolean | null
  inventory?: number | null
  unlimitedInventory?: boolean | null
}

type ProductInventoryConditionData = ProductInventoryData & {
  id: number | string
}

type ProductInventoryCondition = Condition<ProductInventoryConditionData, ProductInventoryData>
type ProductInventoryConditionArgs = Parameters<ProductInventoryCondition>[2]

const isNamedField = (field: Field): field is Field & { name: string } =>
  typeof field === 'object' && field !== null && 'name' in field && typeof field.name === 'string'

const isInventoryField = (
  field: Field,
): field is NumberField & { hasMany?: false | undefined; validate?: NumberFieldSingleValidation } =>
  isNamedField(field) && field.name === 'inventory' && field.type === 'number' && field.hasMany !== true

const hasUnlimitedInventory = (siblingData: unknown): boolean =>
  typeof siblingData === 'object' &&
  siblingData !== null &&
  'unlimitedInventory' in siblingData &&
  siblingData.unlimitedInventory === true

const unlimitedInventoryField: CheckboxField = {
  name: unlimitedInventoryFieldName,
  type: 'checkbox',
  defaultValue: false,
  label: 'Unlimited',
  admin: {
    width: '50%',
  },
}

export const productFields: Field[] = [
  serverURLField(),
  {
    name: 'name',
    type: 'text',
    required: true,
  },

  {
    name: 'company',
    type: 'relationship',
    relationTo: 'companies',
    required: true,
    filterOptions: onlyOwnDocsOrAdminFilter,
  },
  {
    name: 'companyIdentityId',
    type: 'text',
    index: true,
    admin: {
      hidden: true,
      readOnly: true,
    },
  },

  {
    name: 'url',
    type: 'text',
    required: false,
  },

  {
    name: 'orderable',
    type: 'checkbox',
    defaultValue: true,
  },
  readonlyCryptoPriceField({
    name: 'priceInETH',
    label: 'Price in ETH',
  }),
  readonlyCryptoPriceField({
    name: 'priceInSOL',
    label: 'Price in SOL',
  }),
  readonlyCryptoPriceField({
    name: 'priceInTRX',
    label: 'Price in TRX',
  }),
  cryptoAddressesField(),
  {
    name: 'image',
    type: 'upload',
    relationTo: 'media',
  },
  markdownField({
    name: 'description',
    label: 'Description',
  }),
  {
    name: 'properties',
    type: 'array',
    fields: [
      {
        name: 'key',
        type: 'text',
        required: true,
      },
      {
        name: 'value',
        type: 'text',
      },
    ],
  },
  {
    name: 'purchaseCount',
    label: 'Purchases',
    type: 'number',
    defaultValue: 0,
    admin: {
      position: 'sidebar',
      readOnly: true,
    },
    access: {
      create: () => false,
      update: () => false,
    },
  },
  notificationSubscriberCountField(),
  notificationSubscriptionStatusField('products'),
  completenessScoreField,
]

export const mergeProductCollectionFields = (defaultFields: Field[]): Field[] => {
  const fieldsWithUnlimitedInventory: Field[] = []

  defaultFields.forEach((field) => {
    if (!isInventoryField(field)) {
      fieldsWithUnlimitedInventory.push(field)
      return
    }

    const originalCondition = field.admin?.condition
    const originalValidate = field.validate

    const shouldShowUnlimitedInventoryField: ProductInventoryCondition = (
      data,
      siblingData,
      args: ProductInventoryConditionArgs,
    ) => {
      if (originalCondition) {
        return originalCondition(data, siblingData, args)
      }

      return true
    }

    const shouldShowInventoryField: ProductInventoryCondition = (
      data,
      siblingData,
      args: ProductInventoryConditionArgs,
    ) => {
      if (Boolean(siblingData?.unlimitedInventory ?? data?.unlimitedInventory)) {
        return false
      }

      return shouldShowUnlimitedInventoryField(data, siblingData, args)
    }

    const validateInventoryField: NumberFieldSingleValidation = (value, options) => {
      if (hasUnlimitedInventory(options.siblingData)) {
        return true
      }

      if (typeof value !== 'number') {
        return 'Inventory is required unless Unlimited is checked.'
      }

      if (originalValidate) {
        return originalValidate(value, options)
      }

      return true
    }

    fieldsWithUnlimitedInventory.push({
      ...field,
      admin: {
        ...field.admin,
        width: '50%',
        condition: shouldShowInventoryField,
      },
      validate: validateInventoryField,
    })

    fieldsWithUnlimitedInventory.push({
      ...unlimitedInventoryField,
      admin: {
        ...unlimitedInventoryField.admin,
        condition: shouldShowUnlimitedInventoryField,
      },
    })
  })

  return mergeFields(fieldsWithUnlimitedInventory, productFields)
}

export const normalizeProductInventoryData = <T extends ProductInventoryData>(
  data: T | undefined,
): T | undefined => {
  if (!data || !data.unlimitedInventory) {
    return data
  }

  return {
    ...data,
    inventory: null,
  }
}
