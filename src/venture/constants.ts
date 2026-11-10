export const POOL_EVENTS = [
  'event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)',
]
export const DAO_EVENTS = [
  'event ProposalCreated(uint256 proposalId,address proposer,address[] targets,uint256[] values,string[] signatures,bytes[] calldatas,uint256 voteStart,uint256 voteEnd,string description)',
]
export const TOKEN_METADATA = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const INDEX_BLOCK_PAGE_SIZE = 1000
export const VENTURE_INDEX_CACHE_TTL_MS = 15_000
export const VENTURE_INDEX_CACHE_MAX_BYTES = 8 * 1024 * 1024

export const PUBLIC_TEST_RPC_METHODS = [
  'eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_estimateGas',
  'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory',
  'eth_getBalance', 'eth_getCode', 'eth_getStorageAt', 'eth_getLogs',
  'eth_getBlockByHash', 'eth_getBlockByNumber',
  'eth_getBlockTransactionCountByHash', 'eth_getBlockTransactionCountByNumber',
  'eth_getTransactionByHash', 'eth_getTransactionCount', 'eth_getTransactionReceipt',
  'eth_sendRawTransaction', 'net_version', 'web3_clientVersion',
] as const
