import type { Field } from 'payload'

export const addressFields = (): Field[] => [
  {
    name: 'title',
    type: 'text',
    label: 'Title',
  },
  {
    name: 'firstName',
    type: 'text',
    label: 'First Name',
  },
  {
    name: 'lastName',
    type: 'text',
    label: 'Last Name',
  },
  {
    name: 'company',
    type: 'text',
    label: 'Company',
  },
  {
    name: 'addressLine1',
    type: 'text',
    label: 'Address Line 1',
  },
  {
    name: 'addressLine2',
    type: 'text',
    label: 'Address Line 2',
  },
  {
    name: 'city',
    type: 'text',
    label: 'City',
  },
  {
    name: 'state',
    type: 'text',
    label: 'State',
  },
  {
    name: 'postalCode',
    type: 'text',
    label: 'Postal Code',
  },
  {
    name: 'country',
    type: 'text',
    label: 'Country',
  },
  {
    name: 'phone',
    type: 'text',
    label: 'Phone',
  },
]

export const shippingAddressField = (): Field => ({
  name: 'shippingAddress',
  type: 'group',
  label: 'Shipping Address',
  fields: addressFields(),
})
