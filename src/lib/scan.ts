import type { Abi, PublicClient } from 'viem'
import { erc20Abi, factoryAbi, poolAbi, positionManagerAbi } from '../abi/positionManager'
import type { ChainConfig } from '../config/chains'
import { uncollectedFees } from './fees'
import { shortAddress } from './format'
import type { Position, TokenInfo } from './types'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** Contracts per multicall round-trip. Keeps bursts small enough for public RPCs. */
const CHUNK = 120
/** Calldata packed into a single eth_call; the viem default of 1024 is far too chatty. */
const BATCH_SIZE = 8192
/**
 * Vault and manager contracts can own thousands of NFTs. Scanning those over a
 * public RPC is hopeless, so we cap and tell the user rather than hang.
 */
export const MAX_POSITIONS = 400

export type ScanResult = {
  positions: Position[]
  /** Positions owned but not scanned because of MAX_POSITIONS. */
  skipped: number
}

type Call = {
  address: `0x${string}`
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

/**
 * Runs a multicall in sequential chunks. A revert on a metadata call is normal
 * (not every ERC-20 has a string `symbol`), but a failure on a core Uniswap read
 * means the RPC let us down — and reporting that as "no positions" would tell a
 * user with unclaimed fees that they have none. Those stages throw instead.
 */
async function readAll(
  client: PublicClient,
  contracts: readonly Call[],
  options: { label: string; tolerateFailures?: boolean },
): Promise<(unknown | undefined)[]> {
  const out: (unknown | undefined)[] = []
  let failures = 0

  for (let i = 0; i < contracts.length; i += CHUNK) {
    const results = (await client.multicall({
      // viem infers result types per literal contract tuple; this helper is
      // deliberately generic, so the decoded values are cast at each call site.
      contracts: contracts.slice(i, i + CHUNK) as never,
      allowFailure: true,
      batchSize: BATCH_SIZE,
    })) as { status: 'success' | 'failure'; result?: unknown }[]
    for (const result of results) {
      if (result.status === 'success') out.push(result.result)
      else {
        failures++
        out.push(undefined)
      }
    }
  }

  if (failures > 0 && !options.tolerateFailures) {
    throw new Error(`${options.label}: ${failures} из ${contracts.length} вызовов не прошли`)
  }
  return out
}

type RawPosition = {
  tokenId: bigint
  token0: `0x${string}`
  token1: `0x${string}`
  fee: number
  tickLower: number
  tickUpper: number
  liquidity: bigint
  feeGrowthInside0LastX128: bigint
  feeGrowthInside1LastX128: bigint
  tokensOwed0: bigint
  tokensOwed1: bigint
}

/**
 * Reads every V3 position of `owner` on one chain and derives its uncollected
 * fees from pool state. Every call here is `view`, so it all batches through
 * Multicall3 — no need to impersonate the owner in an eth_call.
 */
export async function scanChain(
  client: PublicClient,
  config: ChainConfig,
  owner: `0x${string}`,
): Promise<ScanResult> {
  const manager = config.positionManager
  const empty: ScanResult = { positions: [], skipped: 0 }

  const [balance, factory] = (await readAll(
    client,
    [
      { address: manager, abi: positionManagerAbi, functionName: 'balanceOf', args: [owner] },
      { address: manager, abi: positionManagerAbi, functionName: 'factory' },
    ],
    { label: 'position manager' },
  )) as [bigint, `0x${string}`]

  if (balance === 0n || !factory) return empty

  const owned = Number(balance)
  const scanCount = Math.min(owned, MAX_POSITIONS)
  const skipped = owned - scanCount

  const tokenIds = (await readAll(
    client,
    Array.from({ length: scanCount }, (_, i) => ({
      address: manager,
      abi: positionManagerAbi,
      functionName: 'tokenOfOwnerByIndex' as const,
      args: [owner, BigInt(i)] as const,
    })),
    { label: 'tokenOfOwnerByIndex' },
  )) as bigint[]

  const positionData = (await readAll(
    client,
    tokenIds.map((tokenId) => ({
      address: manager,
      abi: positionManagerAbi,
      functionName: 'positions' as const,
      args: [tokenId] as const,
    })),
    { label: 'positions' },
  )) as readonly unknown[][]

  const raw: RawPosition[] = []
  positionData.forEach((value, i) => {
    const [, , token0, token1, fee, tickLower, tickUpper, liquidity, fg0, fg1, owed0, owed1] =
      value as [
        bigint, `0x${string}`, `0x${string}`, `0x${string}`, number, number, number,
        bigint, bigint, bigint, bigint, bigint,
      ]

    // A fully burned position holds neither liquidity nor unclaimed fees.
    if (liquidity === 0n && owed0 === 0n && owed1 === 0n) return

    raw.push({
      tokenId: tokenIds[i],
      token0,
      token1,
      fee,
      tickLower,
      tickUpper,
      liquidity,
      feeGrowthInside0LastX128: fg0,
      feeGrowthInside1LastX128: fg1,
      tokensOwed0: owed0,
      tokensOwed1: owed1,
    })
  })

  if (raw.length === 0) return { positions: [], skipped }

  // Resolve pools — distinct (token0, token1, fee) triples only.
  const poolKeys = [...new Set(raw.map((p) => `${p.token0}-${p.token1}-${p.fee}`))]
  const poolAddresses = (await readAll(
    client,
    poolKeys.map((key) => {
      const [token0, token1, fee] = key.split('-')
      return {
        address: factory,
        abi: factoryAbi,
        functionName: 'getPool' as const,
        args: [token0 as `0x${string}`, token1 as `0x${string}`, Number(fee)] as const,
      }
    }),
    { label: 'getPool' },
  )) as `0x${string}`[]

  const poolByKey = new Map<string, `0x${string}`>()
  poolAddresses.forEach((address, i) => {
    if (address && address !== ZERO_ADDRESS) poolByKey.set(poolKeys[i], address)
  })

  const pools = [...new Set([...poolByKey.values()])]
  const poolState = await readAll(
    client,
    pools.flatMap((pool) => [
      { address: pool, abi: poolAbi, functionName: 'slot0' as const },
      { address: pool, abi: poolAbi, functionName: 'feeGrowthGlobal0X128' as const },
      { address: pool, abi: poolAbi, functionName: 'feeGrowthGlobal1X128' as const },
    ]),
    { label: 'pool state' },
  )

  const stateByPool = new Map<string, { tick: number; global0: bigint; global1: bigint }>()
  pools.forEach((pool, i) => {
    const slot0 = poolState[i * 3] as readonly unknown[]
    stateByPool.set(pool.toLowerCase(), {
      tick: Number(slot0[1]),
      global0: poolState[i * 3 + 1] as bigint,
      global1: poolState[i * 3 + 2] as bigint,
    })
  })

  const withPool = raw
    .map((p) => ({ raw: p, pool: poolByKey.get(`${p.token0}-${p.token1}-${p.fee}`) }))
    .filter((p): p is { raw: RawPosition; pool: `0x${string}` } => Boolean(p.pool))

  const tickData = await readAll(
    client,
    withPool.flatMap(({ raw: p, pool }) => [
      { address: pool, abi: poolAbi, functionName: 'ticks' as const, args: [p.tickLower] as const },
      { address: pool, abi: poolAbi, functionName: 'ticks' as const, args: [p.tickUpper] as const },
    ]),
    { label: 'ticks' },
  )

  // Token metadata, deduplicated. Non-standard tokens may revert here, and that
  // is survivable: we fall back to the address.
  const tokenAddresses = [
    ...new Set(withPool.flatMap(({ raw: p }) => [p.token0.toLowerCase(), p.token1.toLowerCase()])),
  ] as `0x${string}`[]

  const tokenData = await readAll(
    client,
    tokenAddresses.flatMap((address) => [
      { address, abi: erc20Abi, functionName: 'symbol' as const },
      { address, abi: erc20Abi, functionName: 'decimals' as const },
    ]),
    { label: 'token metadata', tolerateFailures: true },
  )

  const tokenByAddress = new Map<string, TokenInfo>()
  tokenAddresses.forEach((address, i) => {
    const symbol = tokenData[i * 2] as string | undefined
    const decimals = tokenData[i * 2 + 1] as number | undefined
    tokenByAddress.set(address, {
      address,
      symbol: symbol || shortAddress(address),
      decimals: Number(decimals ?? 18),
    })
  })

  const positions: Position[] = []
  withPool.forEach(({ raw: p, pool }, i) => {
    const state = stateByPool.get(pool.toLowerCase())
    const lower = tickData[i * 2] as readonly unknown[] | undefined
    const upper = tickData[i * 2 + 1] as readonly unknown[] | undefined
    if (!state || !lower || !upper) return

    const shared = {
      liquidity: p.liquidity,
      tickLower: p.tickLower,
      tickUpper: p.tickUpper,
      tickCurrent: state.tick,
    }

    const fees0 = uncollectedFees({
      ...shared,
      feeGrowthGlobalX128: state.global0,
      feeGrowthOutsideLowerX128: lower[2] as bigint,
      feeGrowthOutsideUpperX128: upper[2] as bigint,
      feeGrowthInsideLastX128: p.feeGrowthInside0LastX128,
      tokensOwed: p.tokensOwed0,
    })

    const fees1 = uncollectedFees({
      ...shared,
      feeGrowthGlobalX128: state.global1,
      feeGrowthOutsideLowerX128: lower[3] as bigint,
      feeGrowthOutsideUpperX128: upper[3] as bigint,
      feeGrowthInsideLastX128: p.feeGrowthInside1LastX128,
      tokensOwed: p.tokensOwed1,
    })

    if (fees0 === 0n && fees1 === 0n) return

    positions.push({
      key: `${config.chain.id}-${p.tokenId}`,
      chainId: config.chain.id,
      tokenId: p.tokenId,
      pool,
      fee: p.fee,
      tickLower: p.tickLower,
      tickUpper: p.tickUpper,
      tickCurrent: state.tick,
      liquidity: p.liquidity,
      inRange: state.tick >= p.tickLower && state.tick < p.tickUpper,
      token0: tokenByAddress.get(p.token0.toLowerCase())!,
      token1: tokenByAddress.get(p.token1.toLowerCase())!,
      fees0,
      fees1,
      usd: null,
    })
  })

  positions.sort((a, b) => (a.tokenId < b.tokenId ? 1 : -1))
  return { positions, skipped }
}
