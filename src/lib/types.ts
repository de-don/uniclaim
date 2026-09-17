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
}

export type ChainScan = {
  chainId: number
  status: 'idle' | 'loading' | 'done' | 'error'
  positions: Position[]
  /** Positions owned but left unscanned because the wallet holds too many. */
  skipped: number
  error?: string
}
