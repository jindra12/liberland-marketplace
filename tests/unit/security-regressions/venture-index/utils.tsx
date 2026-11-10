import { Contract, ContractFactory, type Event } from '@ethersproject/contracts'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { PaginatedDocs, PayloadRequest } from 'payload'
import type { Startup, VentureChainIndex } from '@/payload-types'
import { POOL_EVENTS, ZERO_ADDRESS } from '@/venture/constants'

export const createVentureIndexRequest = (ventureID: string) => {
  const req = mockDeep<PayloadRequest>()
  req.user = null
  req.routeParams = { id: ventureID }
  req.query = { deploymentId: 'deployment' }
  req.payload.findByID.mockResolvedValue(mock<Startup>({ id: ventureID,
    contractDeployments: [{ id: 'deployment', chain: 'ethereum', tokenAddress: `0x${'11'.repeat(20)}` }],
  }))
  return req
}

export const createVentureIndexFixture = (brokenMethod?: 'symbol' | 'decimals') => {
  const req = mockDeep<PayloadRequest>()
  req.payload.find.mockResolvedValue(
    Object.assign(mock<PaginatedDocs<VentureChainIndex>>(), { docs: [] }),
  )
  const deployment = mock<NonNullable<Startup['contractDeployments']>[number]>({
    chain: 'ethereum',
    chainId: '31337',
    deploymentBlock: 1,
    daoAddress: `0x${'11'.repeat(20)}`,
    tokenAddress: `0x${'22'.repeat(20)}`,
    poolManagerAddress: `0x${'33'.repeat(20)}`,
  })
  const hostileToken = `0x${'44'.repeat(20)}`
  const provider = mockDeep<StaticJsonRpcProvider>()
  provider.getBlockNumber.mockResolvedValue(100)
  provider.getCode.mockResolvedValue('0x1234')
  provider.getBlock.mockResolvedValue(
    mock<Awaited<ReturnType<StaticJsonRpcProvider['getBlock']>>>({ hash: `0x${'ff'.repeat(32)}` }),
  )
  vi.mocked(StaticJsonRpcProvider).mockImplementation(() => provider)
  const eventInterface = ContractFactory.getInterface(POOL_EVENTS)
  const events = [ZERO_ADDRESS, hostileToken].map((currency0, index) => {
    const encoded = eventInterface.encodeEventLog(eventInterface.getEvent('Initialize'), [
      `0x${String(index + 1).repeat(64)}`,
      currency0,
      deployment.tokenAddress,
      3000,
      60,
      ZERO_ADDRESS,
      '79228162514264337593543950336',
      0,
    ])
    return Object.assign(mock<Event>(), {
      args: eventInterface.decodeEventLog('Initialize', encoded.data, encoded.topics),
    })
  })
  vi.mocked(Contract).mockImplementation((address) => {
    if (address === deployment.poolManagerAddress) {
      return Object.assign(mock<Contract>(), {
        filters: { Initialize: vi.fn(() => ({ address })) },
        queryFilter: vi.fn().mockResolvedValueOnce(events).mockResolvedValueOnce([]),
      })
    }
    if (address === deployment.daoAddress) {
      return Object.assign(mock<Contract>(), {
        filters: { ProposalCreated: vi.fn(() => ({ address })) },
        queryFilter: vi.fn().mockResolvedValue([]),
      })
    }
    const token = Object.assign(mock<Contract>(), {
      symbol: vi.fn().mockResolvedValue('FIX'),
      decimals: vi.fn().mockResolvedValue(18),
    })
    if (address === hostileToken && brokenMethod) {
      token[brokenMethod].mockRejectedValue(new Error('Untrusted token metadata reverted'))
    }
    return token
  })
  return { req, deployment, goodPoolId: `0x${'1'.repeat(64)}` }
}
