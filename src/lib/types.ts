export type TokenInfo = {
  address: `0x${string}`
  symbol: string
  decimals: number
}

export type ProtocolVersion = 'v3' | 'v4'

export type Position = {
  key: string
  chainId: number
  version: ProtocolVersion
  tokenId: bigint
  /** v3: the pool contract. v4: the pool id, since v4 has no pool contract. */
  pool: `0x${string}`
  fee: number
  tickLower: number
  tickUpper: number
  tickCurrent: number
  liquidity: bigint
  inRange: boolean
  token0: TokenInfo
  token1: TokenInfo
  fees0: bigint
  fees1: bigint
  /** null while prices are still loading or unavailable for these tokens. */
  usd: number | null
  /** v4 only: the pool's hook contract, zero when the pool has none. */
  hooks?: `0x${string}`
}

export type ChainScan = {
  chainId: number
  status: 'idle' | 'loading' | 'done' | 'error'
  positions: Position[]
  /** Positions owned but left unscanned because the wallet holds too many. */
  skipped: number
  error?: string
  /**
   * v4 is discovered through a public explorer, which can fail independently of
   * the RPC. Kept separate so a v4 outage never hides the v3 results.
   */
  v4Error?: string
}
