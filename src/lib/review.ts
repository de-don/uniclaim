import {
  BaseError,
  ContractFunctionRevertedError,
  decodeFunctionResult,
  formatUnits,
  type Hex,
  type PublicClient,
} from 'viem'
import { getPublicClient } from 'wagmi/actions'
import { positionManagerAbi } from '../abi/positionManager'
import { CHAIN_BY_ID } from '../config/chains'
import { config } from '../wagmi'
import { buildClaimCall, planBatches } from './claimTx'
import { pricedUsd } from './links'
import { fetchNativePrice } from './prices'
import type { Position, ProtocolVersion, TokenInfo } from './types'

export type TokenAmount = { token: TokenInfo; amount: bigint }

/** Fees summed per token across positions, largest raw amount first. */
export function sumByToken(
  positions: Position[],
  amountsOf: (p: Position) => [bigint, bigint] = (p) => [p.fees0, p.fees1],
): TokenAmount[] {
  const byToken = new Map<string, TokenAmount>()
  const add = (token: TokenInfo, amount: bigint) => {
    if (amount === 0n) return
    const key = token.address.toLowerCase()
    const entry = byToken.get(key)
    if (entry) entry.amount += amount
    else byToken.set(key, { token, amount })
  }
  for (const position of positions) {
    const [amount0, amount1] = amountsOf(position)
    add(position.token0, amount0)
    add(position.token1, amount1)
  }
  return [...byToken.values()]
}

export type ReviewedTx = {
  version: ProtocolVersion
  contract: `0x${string}`
  method: string
  positions: number
}

export type ChainReview = {
  chainId: number
  positions: Position[]
  txs: ReviewedTx[]
  receive: TokenAmount[]
  /**
   * `ok`: every transaction ran against current chain state without reverting.
   * `reverted`: the chain refused one — sending it would only burn gas.
   * `unavailable`: the node could not be asked; nothing is known either way.
   */
  simulation: 'ok' | 'reverted' | 'unavailable'
  simulationError?: string
  /** True when every amount shown came back from the contract rather than our maths. */
  amountsFromChain: boolean
  receiveUsd: number
  /** Positions whose tokens have no price, so `receiveUsd` understates them. */
  unpriced: number
  gas?: { native: bigint; symbol: string; decimals: number; usd: number | null }
}

function methodLabel(version: ProtocolVersion, count: number): string {
  return version === 'v3'
    ? `multicall → collect × ${count}`
    : `modifyLiquidities → ${count} position${count === 1 ? '' : 's'}`
}

function isRevert(error: unknown): boolean {
  return error instanceof BaseError && Boolean(error.walk((e) => e instanceof ContractFunctionRevertedError))
}

function reason(error: unknown): string {
  return error instanceof BaseError ? error.shortMessage : String(error)
}

/**
 * Everything the review screen shows for one chain: which contract each
 * transaction calls, what the chain itself says the claim pays out, and what
 * the network fee comes to. Runs the very calls a claim would send, from the
 * owner's address, as read-only `eth_call`s.
 */
export async function reviewChain(
  chainId: number,
  positions: Position[],
  owner: `0x${string}`,
): Promise<ChainReview> {
  const chainConfig = CHAIN_BY_ID.get(chainId)
  const client = getPublicClient(config, { chainId }) as PublicClient | undefined
  const plan = planBatches(positions)
  let calls: ReturnType<typeof buildClaimCall>[]
  try {
    calls = plan.map((planned) => buildClaimCall(chainId, planned, owner))
  } catch (error) {
    return {
      chainId,
      positions,
      txs: [],
      receive: sumByToken(positions),
      simulation: 'reverted',
      simulationError: reason(error),
      amountsFromChain: false,
      receiveUsd: pricedUsd(positions),
      unpriced: positions.filter((p) => p.usd === null).length,
    }
  }

  const txs = plan.map((planned, i) => ({
    version: planned.version,
    contract: calls[i].address,
    method: methodLabel(planned.version, planned.batch.length),
    positions: planned.batch.length,
  }))

  const review: ChainReview = {
    chainId,
    positions,
    txs,
    receive: sumByToken(positions),
    simulation: 'ok',
    amountsFromChain: false,
    receiveUsd: pricedUsd(positions),
    unpriced: positions.filter((p) => p.usd === null).length,
  }
  if (!client || !chainConfig) return { ...review, simulation: 'unavailable' }

  // v3's collect returns what it paid, so those amounts can come straight from
  // the contract. v4's modifyLiquidities returns nothing; for v4 the simulation
  // proves the call goes through and the amounts stay the pool-state figures.
  const fromChain = new Map<string, [bigint, bigint]>()
  let gasUnits = 0n
  let gasKnown = true

  for (const [i, call] of calls.entries()) {
    const { version: _version, ...request } = call
    try {
      const { result } = await client.simulateContract({
        ...request,
        account: owner,
      } as Parameters<typeof client.simulateContract>[0])
      if (call.version === 'v3') {
        const results = result as readonly Hex[]
        plan[i].batch.forEach((position, j) => {
          const [amount0, amount1] = decodeFunctionResult({
            abi: positionManagerAbi,
            functionName: 'collect',
            data: results[j],
          })
          fromChain.set(position.key, [amount0, amount1])
        })
      }
    } catch (error) {
      review.simulation = isRevert(error) ? 'reverted' : 'unavailable'
      review.simulationError = reason(error)
      gasKnown = false
      break
    }

    try {
      gasUnits += await client.estimateContractGas({
        ...request,
        account: owner,
      } as Parameters<typeof client.estimateContractGas>[0])
    } catch {
      gasKnown = false
    }
  }

  if (fromChain.size > 0) {
    review.receive = sumByToken(positions, (p) => fromChain.get(p.key) ?? [p.fees0, p.fees1])
    review.amountsFromChain = fromChain.size === positions.length
  }

  if (gasKnown) {
    try {
      const [gasPrice, nativePrice] = await Promise.all([
        client.getGasPrice(),
        fetchNativePrice(chainConfig.chain.nativeCurrency.symbol),
      ])
      const native = gasUnits * gasPrice
      const { symbol, decimals } = chainConfig.chain.nativeCurrency
      review.gas = {
        native,
        symbol,
        decimals,
        usd: nativePrice === null ? null : Number(formatUnits(native, decimals)) * nativePrice,
      }
    } catch {
      // A fee we cannot price is left out rather than guessed.
    }
  }

  return review
}
