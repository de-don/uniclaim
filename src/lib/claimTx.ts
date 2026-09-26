import { encodeFunctionData, maxUint128 } from 'viem'
import { positionManagerAbi } from '../abi/positionManager'
import { v4PositionManagerAbi } from '../abi/v4'
import { CHAIN_BY_ID } from '../config/chains'
import { V4_BY_CHAIN } from '../config/v4'
import type { Position, ProtocolVersion } from './types'
import { encodeV4Claim } from './v4/claim'

/**
 * Every claim moves up to two token balances per position, so a batch costs
 * roughly 100–200k gas each. Past this count a single transaction risks the
 * block gas limit, so a large selection is split into sequential batches —
 * still far fewer transactions than claiming one position at a time.
 */
export const MAX_PER_TX = 25

/** Seconds a v4 claim stays valid once signed. */
const DEADLINE_WINDOW = 600n

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export type PlannedTx = { version: ProtocolVersion; batch: Position[] }

/**
 * v3 and v4 are separate contracts with separate entry points, so a selection
 * spanning both needs one transaction per protocol on top of the gas split.
 */
export function planBatches(positions: Position[]): PlannedTx[] {
  const plan: PlannedTx[] = []
  for (const version of ['v3', 'v4'] as const) {
    const forVersion = positions.filter((p) => p.version === version)
    for (const batch of chunk(forVersion, MAX_PER_TX)) plan.push({ version, batch })
  }
  return plan
}

export function batchCount(positions: Position[]): number {
  return planBatches(positions).length
}

/**
 * The exact call a claim sends. The review screen simulates and prices this
 * same object, so what was checked and what is signed cannot drift apart.
 */
export function buildClaimCall(chainId: number, { version, batch }: PlannedTx, owner: `0x${string}`) {
  if (version === 'v3') {
    const chainConfig = CHAIN_BY_ID.get(chainId)
    if (!chainConfig) throw new Error('Unsupported chain')
    // The position manager's own multicall: N collect() calls, one tx.
    const calls = batch.map((position) =>
      encodeFunctionData({
        abi: positionManagerAbi,
        functionName: 'collect',
        args: [
          {
            tokenId: position.tokenId,
            recipient: owner,
            amount0Max: maxUint128,
            amount1Max: maxUint128,
          },
        ],
      }),
    )
    return {
      version,
      address: chainConfig.positionManager,
      abi: positionManagerAbi,
      functionName: 'multicall' as const,
      args: [calls] as const,
    }
  }

  const v4 = V4_BY_CHAIN.get(chainId)
  if (!v4) throw new Error('v4 is not available on this chain')
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_WINDOW
  return {
    version,
    address: v4.positionManager,
    abi: v4PositionManagerAbi,
    functionName: 'modifyLiquidities' as const,
    args: [encodeV4Claim(batch), deadline] as const,
  }
}

export type ClaimCall = ReturnType<typeof buildClaimCall>
