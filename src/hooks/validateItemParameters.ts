import { APIError, type CollectionBeforeChangeHook } from 'payload'

import { toStringID } from '@/utilities/toStringID'

type ParameterValueInput = {
  key?: string | null
  name?: string | null
  selected?: boolean | null
}

type ParameterInput = {
  name?: string | null
  values?: ParameterValueInput[] | null
}

type ItemInput = {
  parameters?: ParameterInput[] | null
  product?: unknown
  variant?: unknown
}

type ProductParameterValueDoc = {
  key?: string | null
  name?: string | null
}

type ProductParameterDoc = {
  name?: string | null
  values?: ProductParameterValueDoc[] | null
}

type ProductParameterSourceDoc = {
  parameters?: ProductParameterDoc[] | null
}

export type ValidateItemParametersArgs = {
  data: unknown
  operation: 'create' | 'update'
  req: ValidateItemParametersRequest
}

type ValidateItemParametersRequest = {
  payload: {
    findByID: ValidateItemParametersFindByID
  }
  user?: {
    id?: string | number
    role?: string[] | null
  } | null
}

type ValidateItemParametersFindByIDArgs = {
  collection: 'products' | 'variants'
  depth: 0
  id: string
  overrideAccess: false
  select: Record<string, true>
}

type ValidateItemParametersFindByID = (
  args: ValidateItemParametersFindByIDArgs,
) => Promise<ProductParameterSourceDoc | { product?: unknown }>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const getProductIDFromItem = async ({
  item,
  req,
}: {
  item: ItemInput
  req: ValidateItemParametersRequest
}): Promise<string | null> => {
  const directProductID = toStringID(item.product)
  if (directProductID) {
    return directProductID
  }

  const variantID = toStringID(item.variant)
  if (!variantID) {
    return null
  }

  const variant = (await req.payload.findByID({
    collection: 'variants',
    depth: 0,
    id: variantID,
    overrideAccess: false,
    select: {
      product: true,
    },
  })) as { product?: unknown }

  return toStringID(isRecord(variant) ? variant.product : null)
}

const loadProduct = async ({
  productID,
  req,
}: {
  productID: string
  req: ValidateItemParametersRequest
}): Promise<ProductParameterSourceDoc> => {
  return (await req.payload.findByID({
    collection: 'products',
    depth: 0,
    id: productID,
    overrideAccess: false,
    select: {
      parameters: true,
    },
  })) as ProductParameterSourceDoc
}

const validateItemParameter = ({
  incomingParameter,
  itemIndex,
  productID,
  productParameter,
}: {
  incomingParameter: ParameterInput
  itemIndex: number
  productID: string
  productParameter: ProductParameterDoc
}) => {
  const parameterName = productParameter.name ?? '(unknown)'
  const selectedValues = Array.isArray(incomingParameter.values)
    ? incomingParameter.values.filter((value) => value?.selected === true)
    : []

  if (selectedValues.length !== 1) {
    throw new APIError(
      `Order item at index ${itemIndex} parameter ${parameterName} must select exactly one value.`,
      400,
    )
  }

  const selectedValue = selectedValues[0]
  const expectedValues = Array.isArray(productParameter.values) ? productParameter.values : []
  const selectedMatches = expectedValues.some((value) => {
    return value.key === selectedValue.key && value.name === selectedValue.name
  })

  if (!selectedMatches) {
    throw new APIError(
      `Order item at index ${itemIndex} parameter ${parameterName} includes an invalid value for product ${productID}.`,
      400,
    )
  }
}

const validateItemParameters = async ({
  item,
  itemIndex,
  req,
}: {
  item: ItemInput
  itemIndex: number
  req: ValidateItemParametersRequest
}) => {
  const productID = await getProductIDFromItem({ item, req })
  if (!productID) {
    throw new APIError(`Order item at index ${itemIndex} must include a product or variant.`, 400)
  }

  const product = await loadProduct({ productID, req })
  const productParameters = Array.isArray(product.parameters) ? product.parameters : []
  const incomingParameters = Array.isArray(item.parameters) ? item.parameters : []

  if (productParameters.length === 0) {
    if (incomingParameters.length > 0) {
      throw new APIError(
        `Order item at index ${itemIndex} includes parameters for product ${productID}, but that product does not define parameters.`,
        400,
      )
    }

    return
  }

  if (incomingParameters.length !== productParameters.length) {
    throw new APIError(
      `Order item at index ${itemIndex} must include the same parameter groups as product ${productID}.`,
      400,
    )
  }

  productParameters.forEach((productParameter) => {
    const parameterName = productParameter.name
    const incomingParameter = incomingParameters.find((parameter) => parameter?.name === parameterName)

    if (!parameterName || !incomingParameter) {
      throw new APIError(
        `Order item at index ${itemIndex} is missing parameter ${String(parameterName ?? '(unknown)')} for product ${productID}.`,
        400,
      )
    }

    validateItemParameter({
      incomingParameter,
      itemIndex,
      productID,
      productParameter,
    })
  })
}

export const validateItemParametersOnChange = async ({
  data,
  operation,
  req,
}: ValidateItemParametersArgs): Promise<unknown> => {
  if (!data || (operation !== 'create' && operation !== 'update')) {
    return data
  }

  const items = isRecord(data) ? (data.items as ItemInput[] | undefined) : undefined
  if (!Array.isArray(items) || items.length === 0) {
    return data
  }

  await Promise.all(
    items.map(async (item, itemIndex) => {
      await validateItemParameters({
        item,
        itemIndex,
        req,
      })
    }),
  )

  return data
}

export const validateItemParametersBeforeChange: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) =>
  validateItemParametersOnChange({
    data,
    operation,
    req,
  })
