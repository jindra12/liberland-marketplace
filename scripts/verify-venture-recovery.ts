import 'dotenv/config'
import assert from 'node:assert/strict'
import { createLocalReq, getPayload, type Payload, type TypedUser } from 'payload'
import config from '../src/payload.config'
import { ventureDeploymentRecoveryEndpoints } from '../src/endpoints/ventureDeploymentRecovery'
import { recoveryRecordSchema } from '../src/venture/recoveryUtils'

const ventureId = '600000000000000000000a33'
const walletAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const record = recoveryRecordSchema.parse({
  values: {
    tokenName: 'Recovery test',
    tokenSymbol: 'REC',
    initialSupply: '21000000',
    tokensPerEth: '2000',
    deploymentNetwork: 'localhost',
    acknowledged: true,
  },
  transactions: [{ label: 'Deploy token implementation', hash: `0x${'a'.repeat(64)}` }],
  progress: [],
  manifest: null,
})

const request = async (payload: Payload, method: 'get' | 'put' | 'delete', user?: TypedUser) => {
  const req = await createLocalReq(
    {
      user,
      req: { routeParams: { id: ventureId }, query: { walletAddress }, json: async () => record },
    },
    payload,
  )
  return ventureDeploymentRecoveryEndpoints
    .find((endpoint) => endpoint.method === method)!
    .handler(req)
}

const userFor = async (payload: Payload, email: string) => {
  const existing = (
    await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
    })
  ).docs[0]
  const user =
    existing ||
    (await payload.create({
      collection: 'users',
      data: { email, name: email, emailVerified: false },
    }))
  return { ...user, collection: 'users' as const }
}

const run = async () => {
  assert.equal(
    process.env.DATABASE_URL,
    'mongodb://127.0.0.1:27018/venture-contracts-dev',
    'Only the isolated test database is permitted.',
  )
  const payload = await getPayload({ config })
  try {
    await userFor(payload, 'recovery-admin@example.invalid')
    const owner = await userFor(payload, 'recovery-owner@example.invalid')
    const mallory = await userFor(payload, 'recovery-mallory@example.invalid')
    assert.ok(!owner.role?.includes('admin') && !mallory.role?.includes('admin'))
    await payload.db.updateOne({
      collection: 'startups',
      id: ventureId,
      data: { createdBy: owner.id },
    })
    assert.equal((await request(payload, 'get')).status, 401)
    assert.equal((await request(payload, 'get', mallory)).status, 403)
    if (process.argv.includes('--write')) {
      assert.equal((await request(payload, 'put', owner)).status, 200)
    }
    const response = await request(payload, 'get', owner)
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).record, record)
    await assert.rejects(
      payload.find({ collection: 'venture-deployment-recoveries', overrideAccess: false, user: mallory }),
      /not allowed/,
    )
    console.log('Recovery journal persisted; anonymous and non-owner access denied.')
  } finally {
    await payload.destroy()
  }
}

run().catch((error: Error) => {
  console.error(error)
  process.exitCode = 1
})
