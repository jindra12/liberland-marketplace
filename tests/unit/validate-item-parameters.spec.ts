import { describe, expect, it, vi } from 'vitest'

import {
  validateItemParametersOnChange,
  type ValidateItemParametersArgs,
} from '@/hooks/validateItemParameters'

type ValidateItemParametersTestFindByIDArgs = {
  collection: 'products' | 'variants'
  depth: 0
  id: string
  overrideAccess: false
  req?: unknown
  select: Record<string, true>
}

type ValidateItemParametersTestFindByIDResult = {
  parameters?: Array<{
    name?: string | null
    values?: Array<{
      key?: string | null
      name?: string | null
    }>
  }>
  product?: unknown
}

type ValidateItemParametersTestFindByID = (
  args: ValidateItemParametersTestFindByIDArgs,
) => Promise<ValidateItemParametersTestFindByIDResult>

type ValidateItemParametersTestRequest = {
  payload: {
    findByID: ValidateItemParametersTestFindByID
  }
  user: {
    id: string
    role: string[]
  }
}

const createReq = () => {
  const product = {
    id: 'product-1',
    parameters: [
      {
        name: 'Size',
        values: [
          { key: 'S', name: 'Small' },
          { key: 'M', name: 'Medium' },
        ],
      },
      {
        name: 'Color',
        values: [
          { key: 'RED', name: 'Red' },
          { key: 'BLUE', name: 'Blue' },
        ],
      },
    ],
  }

  const variant = {
    id: 'variant-1',
    product: 'product-1',
  }

  const payload = {
    findByID: vi.fn(async (args: ValidateItemParametersTestFindByIDArgs) => {
      const { collection, id } = args

      if (collection === 'products' && id === 'product-1') {
        return product
      }

      if (collection === 'variants' && id === 'variant-1') {
        return variant
      }

      throw new Error(`Unexpected findByID(${collection}, ${id})`)
    }),
  }

  return {
    payload,
    user: {
      id: 'user-1',
      role: ['user'],
    },
  } satisfies ValidateItemParametersTestRequest
}

describe('validateItemParametersOnChange', () => {
  it('allows a cart or order item to select known product parameters', async () => {
    const req = createReq()

    const args = {
      data: {
        items: [
          {
            product: 'product-1',
            parameters: [
              {
                name: 'Size',
                values: [
                  { key: 'S', name: 'Small', selected: false },
                  { key: 'M', name: 'Medium', selected: true },
                ],
              },
              {
                name: 'Color',
                values: [
                  { key: 'RED', name: 'Red', selected: true },
                  { key: 'BLUE', name: 'Blue', selected: false },
                ],
              },
            ],
          },
        ],
      },
      operation: 'create',
      req,
    } satisfies ValidateItemParametersArgs

    await expect(validateItemParametersOnChange(args)).resolves.toBeDefined()

    expect(req.payload.findByID).toHaveBeenCalledTimes(1)
  })

  it('allows selection through a variant-backed item as well', async () => {
    const req = createReq()

    const args = {
      data: {
        items: [
          {
            variant: 'variant-1',
            parameters: [
              {
                name: 'Size',
                values: [
                  { key: 'S', name: 'Small', selected: true },
                  { key: 'M', name: 'Medium', selected: false },
                ],
              },
              {
                name: 'Color',
                values: [
                  { key: 'RED', name: 'Red', selected: false },
                  { key: 'BLUE', name: 'Blue', selected: true },
                ],
              },
            ],
          },
        ],
      },
      operation: 'update',
      req,
    } satisfies ValidateItemParametersArgs

    await expect(validateItemParametersOnChange(args)).resolves.toBeDefined()

    expect(req.payload.findByID).toHaveBeenCalledTimes(2)
  })

  it('rejects spoofed parameter values that do not exist on the product', async () => {
    const req = createReq()

    const args = {
      data: {
        items: [
          {
            product: 'product-1',
            parameters: [
              {
                name: 'Size',
                values: [
                  { key: 'S', name: 'Small', selected: false },
                  { key: 'XL', name: 'Extra large', selected: true },
                ],
              },
              {
                name: 'Color',
                values: [
                  { key: 'RED', name: 'Red', selected: true },
                  { key: 'BLUE', name: 'Blue', selected: false },
                ],
              },
            ],
          },
        ],
      },
      operation: 'create',
      req,
    } satisfies ValidateItemParametersArgs

    await expect(validateItemParametersOnChange(args)).rejects.toThrow('includes an invalid value')
  })
})
