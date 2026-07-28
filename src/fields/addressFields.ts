import type { Field } from 'payload'
import { TEXT_INPUT_MAX_LENGTH } from './constants'

export const addressFields = (): Field[] => [
  {
    name: 'title',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'Title',
  },
  {
    name: 'firstName',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'First Name',
  },
  {
    name: 'lastName',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'Last Name',
  },
  {
    name: 'company',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'Company',
  },
  {
    name: 'addressLine1',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'Address Line 1',
  },
  {
    name: 'addressLine2',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'Address Line 2',
  },
  {
    name: 'city',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'City',
  },
  {
    name: 'state',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'State',
  },
  {
    name: 'postalCode',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'Postal Code',
  },
  {
    name: 'country',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'Country',
  },
  {
    name: 'phone',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
    label: 'Phone',
  },
]

export const shippingAddressField = (): Field => ({
  name: 'shippingAddress',
  type: 'group',
  label: 'Shipping Address',
  fields: addressFields(),
})
