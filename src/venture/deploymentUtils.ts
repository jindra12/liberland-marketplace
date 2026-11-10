import { APIError } from 'payload'
import isEqual from 'lodash/isEqual.js'
import type { Startup } from '@/payload-types'

type VentureDeployment = NonNullable<Startup['contractDeployments']>[number]

/** Contract registrations are append-only; stale clients cannot remove or rewrite deployed addresses. */
export const mergeDeploymentRecords = (
  current: VentureDeployment[],
  incoming: VentureDeployment[],
): VentureDeployment[] =>
  incoming.reduce((records, deployment) => {
    const saved = records.find(
      (entry) =>
        (deployment.id && entry.id === deployment.id) ||
        (entry.chain === deployment.chain &&
          entry.chainId === deployment.chainId &&
          entry.tokenAddress?.toLowerCase() === deployment.tokenAddress?.toLowerCase()),
    )
    if (!saved) {
      return [...records, deployment]
    }
    if (
      Object.entries(deployment).some(
        ([key, value]) =>
          key !== 'id' &&
          value !== undefined &&
          !isEqual(saved[key as keyof VentureDeployment], value),
      )
    ) {
      throw new APIError(
        'A saved deployment cannot be overwritten. Register a new deployment instead.',
        409,
      )
    }
    return records
  }, current)
