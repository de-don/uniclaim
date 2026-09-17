import { encodeAbiParameters, keccak256, numberToHex, type PublicClient } from 'viem'
import { erc20Abi } from '../../abi/positionManager'
import { poolKeyComponents, stateViewAbi, v4PositionManagerAbi } from '../../abi/v4'
import type { ChainConfig } from '../../config/chains'
import type { V4Config } from '../../config/v4'
import { feesFromGrowth } from '../fees'
import { shortAddress } from '../format'
import { readAll } from '../multicall'
import type { Position, TokenInfo } from '../types'
import { discoverV4TokenIds } from './discover'

export const NATIVE_CURRENCY = '0x0000000000000000000000000000000000000000'

export type PoolKey = {
  currency0: `0x${string}`
  currency1: `0x${string}`
  fee: number
  tickSpacing: number
  hooks: `0x${string}`
}

/** A pool's identity in v4 is the hash of its key; there is no pool contract. */
export function poolIdOf(key: PoolKey): `0x${string}` {
  return keccak256(
    encodeAbiParameters([{ type: 'tuple', components: poolKeyComponents }], [key as never]),
  )
}

function toInt24(value: bigint): number {
  const masked = Number(value & 0xffffffn)
  return masked >= 0x800000 ? masked - 0x1000000 : masked
}

/**
 * PositionInfo packs the pool id, both ticks and a subscriber flag into one
 * word: `200 bits poolId | 24 bits tickUpper | 24 bits tickLower | 8 bits flag`.
 * The stored pool id is truncated, so the full one is recomputed from the
 * PoolKey that comes back alongside it.
 */
export function unpackPositionInfo(info: bigint): { tickLower: number; tickUpper: number } {
  return {
    tickLower: toInt24(info >> 8n),
    tickUpper: toInt24(info >> 32n),
  }
}

/**
 * v4 pools address native ETH as the zero address rather than wrapping it, so
 * that currency has no ERC-20 to ask for a symbol.
 */
function nativeToken(config: ChainConfig): TokenInfo {
  return {
    address: NATIVE_CURRENCY,
    symbol: config.chain.nativeCurrency.symbol,
    decimals: config.chain.nativeCurrency.decimals,
  }
}

export async function scanChainV4(
  client: PublicClient,
  chainConfig: ChainConfig,
  v4: V4Config,
  owner: `0x${string}`,
): Promise<Position[]> {
  return scanV4TokenIds(client, chainConfig, v4, await discoverV4TokenIds(client, v4, owner))
}

/**
 * Everything after discovery. Kept separate because the explorer lookup is the
 * one part that cannot run outside a browser — Robinhood Chain's instance turns
 * away non-browser clients — so the verification scripts drive this directly
 * with known token ids.
 */
export async function scanV4TokenIds(
  client: PublicClient,
  chainConfig: ChainConfig,
  v4: V4Config,
  tokenIds: bigint[],
): Promise<Position[]> {
  if (tokenIds.length === 0) return []

  const details = await readAll(
    client,
    tokenIds.flatMap((tokenId) => [
      {
        address: v4.positionManager,
        abi: v4PositionManagerAbi,
        functionName: 'getPoolAndPositionInfo' as const,
        args: [tokenId] as const,
      },
      {
        address: v4.positionManager,
        abi: v4PositionManagerAbi,
        functionName: 'getPositionLiquidity' as const,
        args: [tokenId] as const,
      },
    ]),
    { label: 'v4 position info' },
  )

  type Entry = { tokenId: bigint; key: PoolKey; poolId: `0x${string}`; tickLower: number; tickUpper: number; liquidity: bigint }
  const entries: Entry[] = []

  tokenIds.forEach((tokenId, i) => {
    const [key, info] = details[i * 2] as [PoolKey, bigint]
    const liquidity = details[i * 2 + 1] as bigint
    const { tickLower, tickUpper } = unpackPositionInfo(info)
    // Liquidity can be zero while fees are still owed, so it is not a filter.
    entries.push({ tokenId, key, poolId: poolIdOf(key), tickLower, tickUpper, liquidity })
  })

  const state = await readAll(
    client,
    entries.flatMap((e) => [
      {
        address: v4.stateView,
        abi: stateViewAbi,
        functionName: 'getFeeGrowthInside' as const,
        args: [e.poolId, e.tickLower, e.tickUpper] as const,
      },
      {
        address: v4.stateView,
        abi: stateViewAbi,
        functionName: 'getPositionInfo' as const,
        // A v4 pool tracks liquidity per (owner, range, salt); the position
        // manager is the owner of record and the token id is the salt.
        args: [
          e.poolId,
          v4.positionManager,
          e.tickLower,
          e.tickUpper,
          numberToHex(e.tokenId, { size: 32 }),
        ] as const,
      },
      {
        address: v4.stateView,
        abi: stateViewAbi,
        functionName: 'getSlot0' as const,
        args: [e.poolId] as const,
      },
    ]),
    { label: 'v4 pool state' },
  )

  const currencies = [
    ...new Set(
      entries.flatMap((e) => [e.key.currency0.toLowerCase(), e.key.currency1.toLowerCase()]),
    ),
  ].filter((c) => c !== NATIVE_CURRENCY) as `0x${string}`[]

  const metadata = await readAll(
    client,
    currencies.flatMap((address) => [
      { address, abi: erc20Abi, functionName: 'symbol' as const },
      { address, abi: erc20Abi, functionName: 'decimals' as const },
    ]),
    { label: 'v4 token metadata', tolerateFailures: true },
  )

  const tokenByAddress = new Map<string, TokenInfo>([[NATIVE_CURRENCY, nativeToken(chainConfig)]])
  currencies.forEach((address, i) => {
    tokenByAddress.set(address, {
      address,
      symbol: (metadata[i * 2] as string | undefined) || shortAddress(address),
      decimals: Number((metadata[i * 2 + 1] as number | undefined) ?? 18),
    })
  })

  const positions: Position[] = []
  entries.forEach((entry, i) => {
    const [inside0, inside1] = state[i * 3] as [bigint, bigint]
    const [, last0, last1] = state[i * 3 + 1] as [bigint, bigint, bigint]
    const slot0 = state[i * 3 + 2] as readonly unknown[]
    const tickCurrent = Number(slot0[1])

    const fees0 = feesFromGrowth(entry.liquidity, inside0, last0)
    const fees1 = feesFromGrowth(entry.liquidity, inside1, last1)
    if (fees0 === 0n && fees1 === 0n) return

    positions.push({
      key: `v4-${chainConfig.chain.id}-${entry.tokenId}`,
      chainId: chainConfig.chain.id,
      version: 'v4',
      tokenId: entry.tokenId,
      pool: entry.poolId,
      fee: entry.key.fee,
      tickLower: entry.tickLower,
      tickUpper: entry.tickUpper,
      tickCurrent,
      liquidity: entry.liquidity,
      inRange: tickCurrent >= entry.tickLower && tickCurrent < entry.tickUpper,
      token0: tokenByAddress.get(entry.key.currency0.toLowerCase())!,
      token1: tokenByAddress.get(entry.key.currency1.toLowerCase())!,
      fees0,
      fees1,
      usd: null,
      hooks: entry.key.hooks,
    })
  })

  return positions.sort((a, b) => (a.tokenId < b.tokenId ? 1 : -1))
}
