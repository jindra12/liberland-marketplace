import { Field } from "payload"

const isNamed = (f: Field): f is Field & { name: string } =>
  typeof f === 'object' && f !== null && 'name' in f && typeof f.name === 'string'

export const mergeFields = (base: Field[], extra: Field[]) => {
  const baseNames = new Set(base.filter(isNamed).map(f => f.name))
  return [
    ...base,
    ...extra.filter(f => !isNamed(f) || !baseNames.has(f.name)),
  ]
};
