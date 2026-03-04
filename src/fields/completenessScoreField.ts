import type { Field } from 'payload'

export const completenessScoreField: Field = {
  name: 'completenessScore',
  type: 'number',
  defaultValue: 0,
  index: true,
  admin: {
    hidden: true,
    readOnly: true,
  },
}
