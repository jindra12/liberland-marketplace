import { Contract } from '@ethersproject/contracts'
import { StaticJsonRpcProvider } from '@ethersproject/providers'
import type { PayloadRequest } from 'payload'
import { getThirdwebRpcUrlForEvmChain } from '@/crypto/thirdweb'
import type { Startup } from '@/payload-types'
import {
  DAO_EVENTS,
  INDEX_BLOCK_PAGE_SIZE,
  POOL_EVENTS,
  TOKEN_METADATA,
  ZERO_ADDRESS,
} from './constants'
import type { IndexedPool, IndexedProposal, VentureIndexSnapshot } from './types'

type Deployment = NonNullable<Startup['contractDeployments']>[number]

const currencyMetadata = async (provider: StaticJsonRpcProvider, address: string) => {
  if (address === ZERO_ADDRESS) {
    return { address, symbol: 'ETH', decimals: 18 }
  }
  const token = new Contract(address, TOKEN_METADATA, provider)
  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()])
  return { address, symbol: String(symbol), decimals: Number(decimals) }
}

export const syncVentureIndex = async (
  req: PayloadRequest,
  ventureID: string,
  deployment: Deployment,
): Promise<VentureIndexSnapshot> => {
  const chainId = Number(deployment.chainId)
  if (
    ![1, 11155111, 31337].includes(chainId) ||
    deployment.chain !== 'ethereum' ||
    !deployment.daoAddress ||
    !deployment.tokenAddress ||
    !deployment.poolManagerAddress ||
    deployment.deploymentBlock === null ||
    deployment.deploymentBlock === undefined
  ) {
    throw new Error(
      'This deployment needs an Ethereum network, contract addresses, and its deployment block.',
    )
  }
  const rpcUrl = chainId === 31337 ? 'http://127.0.0.1:8545' : getThirdwebRpcUrlForEvmChain(chainId)
  if (!rpcUrl) {
    throw new Error('Thirdweb RPC is not configured for Venture indexing.')
  }
  const provider = new StaticJsonRpcProvider({ url: rpcUrl, skipFetchSetup: true }, chainId)
  const latest = await provider.getBlockNumber()
  if (deployment.deploymentBlock > latest) {
    throw new Error(
      'The deployment block is ahead of this network. The test fork may have been reset.',
    )
  }
  if ((await provider.getCode(deployment.daoAddress)) === '0x') {
    throw new Error(
      'The deployed DAO is not present on this network. The test fork may have been reset.',
    )
  }
  const key = `${ventureID}:${chainId}:${deployment.daoAddress.toLowerCase()}`
  const existing = (
    await req.payload.find({
      collection: 'venture-chain-indexes',
      where: { key: { equals: key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
  ).docs[0]
  const cursor =
    existing && existing.lastBlock <= latest ? await provider.getBlock(existing.lastBlock) : null
  const valid = existing && cursor?.hash === existing.blockHash
  const fromBlock = valid ? existing.lastBlock + 1 : deployment.deploymentBlock
  const previousPools = valid ? (existing.pools as IndexedPool[]) : []
  const previousProposals = valid ? (existing.proposals as IndexedProposal[]) : []
  if (fromBlock > latest) {
    return {
      pools: previousPools,
      proposals: previousProposals,
      lastBlock: existing!.lastBlock,
      blockHash: existing!.blockHash,
      hasMore: false,
    }
  }
  const toBlock = Math.min(latest, fromBlock + INDEX_BLOCK_PAGE_SIZE - 1)
  const manager = new Contract(deployment.poolManagerAddress, POOL_EVENTS, provider)
  const dao = new Contract(deployment.daoAddress, DAO_EVENTS, provider)
  const [firstPools, secondPools, proposalEvents] = await Promise.all([
    manager.queryFilter(
      manager.filters.Initialize(null, deployment.tokenAddress, null),
      fromBlock,
      toBlock,
    ),
    manager.queryFilter(
      manager.filters.Initialize(null, null, deployment.tokenAddress),
      fromBlock,
      toBlock,
    ),
    dao.queryFilter(dao.filters.ProposalCreated(), fromBlock, toBlock),
  ])
  const discoveredPools = await Promise.all(
    [...firstPools, ...secondPools].map(async (event): Promise<IndexedPool> => {
      const args = event.args!
      const currency0 = await currencyMetadata(provider, String(args.currency0))
      const currency1 = await currencyMetadata(provider, String(args.currency1))
      return {
        id: String(args.id),
        key: {
          currency0: currency0.address,
          currency1: currency1.address,
          fee: Number(args.fee),
          tickSpacing: Number(args.tickSpacing),
          hooks: String(args.hooks),
        },
        currency0,
        currency1,
      }
    }),
  )
  const discoveredProposals = proposalEvents.map(
    (event): IndexedProposal => ({
      id: String(event.args!.proposalId),
      proposer: String(event.args!.proposer),
      description: String(event.args!.description),
      targets: Array.from(event.args!.targets),
      values: Array.from(event.args![3], String),
      calldatas: Array.from(event.args!.calldatas),
    }),
  )
  const pools = Array.from(
    new Map([...previousPools, ...discoveredPools].map((pool) => [pool.id, pool])).values(),
  )
  const proposals = Array.from(
    new Map(
      [...previousProposals, ...discoveredProposals].map((proposal) => [proposal.id, proposal]),
    ).values(),
  )
  const blockHash = (await provider.getBlock(toBlock)).hash
  const data = { key, pools, proposals, lastBlock: toBlock, blockHash }
  if (existing) {
    await req.payload.update({
      collection: 'venture-chain-indexes',
      id: existing.id,
      data,
      overrideAccess: true,
      req,
    })
  } else {
    await req.payload.create({
      collection: 'venture-chain-indexes',
      data,
      overrideAccess: true,
      req,
    })
  }
  return { pools, proposals, lastBlock: toBlock, blockHash, hasMore: toBlock < latest }
}
