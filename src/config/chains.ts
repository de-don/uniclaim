import {
  arbitrum,
  avalanche,
  base,
  blast,
  bsc,
  celo,
  mainnet,
  optimism,
  polygon,
  robinhood,
  type Chain,
} from 'wagmi/chains'

/**
 * Uniswap V3 NonfungiblePositionManager per chain.
 * The factory address is not hardcoded — it is read from the manager at runtime,
 * so a single wrong constant here cannot silently point us at the wrong pools.
 */
export type ChainConfig = {
  chain: Chain
  positionManager: `0x${string}`
  /** DefiLlama price API chain key. */
  llamaKey: string
  color: string
  /**
   * Path segment the Uniswap interface uses for this chain. Omitted where it
   * has no page for the chain, in which case positions link to the block
   * explorer instead — a link that is merely less pretty, never broken.
   */
  uniswapSlug?: string
  /**
   * Public endpoints, probed for real Multicall3 `eth_call` support. Scanning a
   * wallet is read-heavy enough to trip a single provider's rate limit, so each
   * chain gets several and viem rotates on failure.
   */
  rpcUrls: string[]
}

export const CHAINS: ChainConfig[] = [
  {
    chain: mainnet,
    uniswapSlug: 'ethereum',
    rpcUrls: [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.drpc.org',
    ],
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    llamaKey: 'ethereum',
    color: '#627eea',
  },
  {
    chain: arbitrum,
    uniswapSlug: 'arbitrum',
    rpcUrls: [
      'https://arbitrum-one-rpc.publicnode.com',
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.drpc.org',
    ],
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    llamaKey: 'arbitrum',
    color: '#28a0f0',
  },
  {
    chain: optimism,
    uniswapSlug: 'optimism',
    rpcUrls: [
      'https://optimism-rpc.publicnode.com',
      'https://mainnet.optimism.io',
      'https://optimism.drpc.org',
    ],
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    llamaKey: 'optimism',
    color: '#ff0420',
  },
  {
    chain: polygon,
    uniswapSlug: 'polygon',
    rpcUrls: [
      'https://polygon-bor-rpc.publicnode.com',
      'https://polygon.drpc.org',
    ],
    positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    llamaKey: 'polygon',
    color: '#8247e5',
  },
  {
    chain: base,
    uniswapSlug: 'base',
    rpcUrls: [
      'https://base-rpc.publicnode.com',
      'https://mainnet.base.org',
      'https://base.drpc.org',
    ],
    positionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    llamaKey: 'base',
    color: '#3b7cff',
  },
  {
    chain: bsc,
    uniswapSlug: 'bnb',
    rpcUrls: [
      'https://bsc-rpc.publicnode.com',
      'https://bsc-dataseed.binance.org',
    ],
    positionManager: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613',
    llamaKey: 'bsc',
    color: '#f0b90b',
  },
  {
    chain: avalanche,
    uniswapSlug: 'avalanche',
    rpcUrls: [
      'https://avalanche-c-chain-rpc.publicnode.com',
      'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche.drpc.org',
    ],
    positionManager: '0x655C406EBFa14EE2006250925e54ec43AD184f8B',
    llamaKey: 'avax',
    color: '#e84142',
  },
  {
    chain: celo,
    uniswapSlug: 'celo',
    rpcUrls: [
      'https://forno.celo.org',
      'https://celo-rpc.publicnode.com',
      'https://celo.drpc.org',
    ],
    positionManager: '0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A',
    llamaKey: 'celo',
    color: '#fcff52',
  },
  {
    /**
     * Robinhood Chain runs a genuine v3 deployment, but not at the canonical
     * addresses every other chain reuses: those hold unrelated 2 kB contracts
     * that answer nothing. The real manager was found by tracing the `sender` of
     * pool Mint events, and its bytecode matches Ethereum's byte for byte in
     * length, differing only where constructor immutables are baked in.
     */
    chain: robinhood,
    positionManager: '0x73991a25c818bf1f1128deaab1492d45638de0d3',
    rpcUrls: [
      'https://rpc.ordofi.network',
      'https://rpc.mainnet.chain.robinhood.com',
      'https://robinhood-rpc.publicnode.com',
    ],
    llamaKey: 'robinhood',
    color: '#00c805',
  },
  {
    chain: blast,
    uniswapSlug: 'blast',
    rpcUrls: [
      'https://rpc.blast.io',
      'https://blast-rpc.publicnode.com',
      'https://blast.drpc.org',
    ],
    positionManager: '0xB218e4f7cF0533d4696fDfC419A0023D33345F28',
    llamaKey: 'blast',
    color: '#fcfc03',
  },
]

export const CHAIN_BY_ID = new Map(CHAINS.map((c) => [c.chain.id, c]))
export const SUPPORTED_CHAINS = CHAINS.map((c) => c.chain) as [Chain, ...Chain[]]
