import 'dotenv/config'

type LocalUser = {
  id: number | string
}

type Scenario = {
  attackerIdentityID?: string
  attackerUser?: LocalUser
  ownerCompanyID?: string
  userIDs: string[]
}

type TargetCollection = 'jobs' | 'products' | 'startups'

type ForeignCompanyCreateResult = {
  docID: null | string
  errorMessage: null | string
  fatalMessage: null | string
  success: boolean
  target: TargetCollection
}

const resultPrefix = 'RESULT_JSON:'

const emitResult = (result: ForeignCompanyCreateResult) => {
  console.log(`${resultPrefix}${JSON.stringify(result)}`)
}

const target = process.argv[2] as TargetCollection | undefined

const suffix = () => crypto.randomUUID().slice(0, 8)

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const trackID = (ids: string[], id: number | string) => {
  ids.push(String(id))
}

const main = async () => {
  if (!target || !['jobs', 'products', 'startups'].includes(target)) {
    emitResult({
      docID: null,
      errorMessage: null,
      fatalMessage: `Unsupported target: ${target ?? 'missing'}`,
      success: false,
      target: (target ?? 'products') as TargetCollection,
    })
    return
  }

  let payload: Awaited<ReturnType<(typeof import('payload'))['getPayload']>> | null = null
  const scenario: Scenario = { userIDs: [] }

  try {
    const [{ getPayload }, configModule] = await Promise.all([
      import('payload'),
      import('../../../src/payload.config'),
    ])

    payload = await getPayload({ config: await configModule.default })

    const createUser = async (label: string) => {
      if (!payload) {
        throw new Error('Payload is not initialized.')
      }

      return payload.create({
        collection: 'users',
        data: {
          email: `${label}-${suffix()}@example.com`,
          emailVerified: true,
          name: label,
        },
      })
    }

    const bootstrapUser = await createUser('foreign-company-bootstrap')
    trackID(scenario.userIDs, bootstrapUser.id)

    const ownerUser = (await createUser('foreign-company-owner')) as LocalUser
    trackID(scenario.userIDs, ownerUser.id)

    const attackerUser = (await createUser('foreign-company-attacker')) as LocalUser
    trackID(scenario.userIDs, attackerUser.id)
    scenario.attackerUser = attackerUser

    const ownerIdentity = await payload.create({
      collection: 'identities',
      data: {
        createdBy: String(ownerUser.id),
        name: `Owner Tribe ${suffix()}`,
      },
      draft: false,
      overrideAccess: false,
      user: ownerUser as never,
    })

    const attackerIdentity = await payload.create({
      collection: 'identities',
      data: {
        createdBy: String(attackerUser.id),
        name: `Attacker Tribe ${suffix()}`,
      },
      draft: false,
      overrideAccess: false,
      user: attackerUser as never,
    })

    scenario.attackerIdentityID = String(attackerIdentity.id)

    const ownerCompany = await payload.create({
      collection: 'companies',
      data: {
        createdBy: String(ownerUser.id),
        identity: ownerIdentity.id,
        name: `Owner Company ${suffix()}`,
        _status: 'published',
      },
      draft: false,
      overrideAccess: false,
      user: ownerUser as never,
    })

    scenario.ownerCompanyID = String(ownerCompany.id)

    try {
      const doc =
        target === 'jobs'
          ? await payload.create({
            collection: 'jobs',
            data: {
              company: scenario.ownerCompanyID,
              employmentType: 'full-time',
              positions: 1,
              title: `Foreign Job ${suffix()}`,
              _status: 'draft',
            },
            draft: true,
            overrideAccess: false,
            user: scenario.attackerUser as never,
          })
          : target === 'startups'
            ? await payload.create({
              collection: 'startups',
              data: {
                company: scenario.ownerCompanyID,
                identity: scenario.attackerIdentityID,
                stage: 'idea',
                title: `Foreign Startup ${suffix()}`,
                _status: 'draft',
              },
              draft: true,
              overrideAccess: false,
              user: scenario.attackerUser as never,
            })
            : await payload.create({
              collection: 'products',
              data: {
                company: scenario.ownerCompanyID,
                name: `Foreign Product ${suffix()}`,
                _status: 'draft',
              },
              draft: true,
              overrideAccess: false,
              user: scenario.attackerUser as never,
            })

      emitResult({
        docID: String(doc.id),
        errorMessage: null,
        fatalMessage: null,
        success: true,
        target,
      })
    } catch (error) {
      emitResult({
        docID: null,
        errorMessage: toErrorMessage(error),
        fatalMessage: null,
        success: false,
        target,
      })
    }
  } catch (error) {
    emitResult({
      docID: null,
      errorMessage: null,
      fatalMessage: toErrorMessage(error),
      success: false,
      target,
    })
  } finally {
    if (!payload || scenario.userIDs.length === 0) {
      return
    }

    const ownerWhere = {
      createdBy: {
        in: scenario.userIDs,
      },
    }

    for (const collection of ['jobs', 'startups', 'products', 'companies', 'identities'] as const) {
      try {
        await payload.delete({
          collection,
          where: ownerWhere,
        })
      } catch {
        // Best-effort cleanup for access regression runs.
      }
    }

    try {
      await payload.delete({
        collection: 'users',
        where: {
          id: {
            in: scenario.userIDs,
          },
        },
      })
    } catch {
      // Best-effort cleanup for access regression runs.
    }
  }
}

main()
  .catch((error) => {
    emitResult({
      docID: null,
      errorMessage: null,
      fatalMessage: toErrorMessage(error),
      success: false,
      target: (target ?? 'products') as TargetCollection,
    })
  })
  .finally(() => {
    process.exit(0)
  })
