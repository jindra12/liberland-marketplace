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
