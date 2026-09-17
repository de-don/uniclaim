import { useCallback, useState } from 'react'
import { encodeFunctionData, maxUint128 } from 'viem'
import { useAccount, useConfig, useWriteContract } from 'wagmi'
import { switchChain, waitForTransactionReceipt } from 'wagmi/actions'
import { positionManagerAbi } from '../abi/positionManager'
import { v4PositionManagerAbi } from '../abi/v4'
import { CHAIN_BY_ID } from '../config/chains'
import { V4_BY_CHAIN } from '../config/v4'
import { encodeV4Claim } from '../lib/v4/claim'
import type { Position, ProtocolVersion } from '../lib/types'

/**
 * Every claim moves up to two token balances per position, so a batch costs
 * roughly 100–200k gas each. Past this count a single transaction risks the
 * block gas limit, so a large selection is split into sequential batches —
 * still far fewer transactions than claiming one position at a time.
 */
export const MAX_PER_TX = 25

/** Seconds a v4 claim stays valid once signed. */
const DEADLINE_WINDOW = 600n

export type ClaimState = {
  chainId: number | null
  status: 'idle' | 'switching' | 'signing' | 'pending' | 'success' | 'error'
  hash?: `0x${string}`
  error?: string
  /** 1-based progress when a claim spans several transactions. */
  batch?: { index: number; total: number }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * v3 and v4 are separate contracts with separate entry points, so a selection
 * spanning both needs one transaction per protocol on top of the gas split.
 */
export function planBatches(positions: Position[]): { version: ProtocolVersion; batch: Position[] }[] {
  const plan: { version: ProtocolVersion; batch: Position[] }[] = []
  for (const version of ['v3', 'v4'] as const) {
    const forVersion = positions.filter((p) => p.version === version)
    for (const batch of chunk(forVersion, MAX_PER_TX)) plan.push({ version, batch })
  }
  return plan
}

export function batchCount(positions: Position[]): number {
  return planBatches(positions).length
}

export function useClaim() {
  const { address } = useAccount()
  const wagmiConfig = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [state, setState] = useState<ClaimState>({ chainId: null, status: 'idle' })

  const reset = useCallback(() => setState({ chainId: null, status: 'idle' }), [])

  const claim = useCallback(
    async (chainId: number, positions: Position[]): Promise<Position[]> => {
      if (!address || positions.length === 0) return []
      const chainConfig = CHAIN_BY_ID.get(chainId)
      if (!chainConfig) return []

      const plan = planBatches(positions)
      const claimed: Position[] = []

      try {
        setState({ chainId, status: 'switching' })
        await switchChain(wagmiConfig, { chainId })

        for (const [index, { version, batch }] of plan.entries()) {
          const progress = { index: index + 1, total: plan.length }
          setState({ chainId, status: 'signing', batch: progress })

          let hash: `0x${string}`
          if (version === 'v3') {
            // The position manager's own multicall: N collect() calls, one tx.
            const calls = batch.map((position) =>
              encodeFunctionData({
                abi: positionManagerAbi,
                functionName: 'collect',
                args: [
                  {
                    tokenId: position.tokenId,
                    recipient: address,
                    amount0Max: maxUint128,
                    amount1Max: maxUint128,
                  },
                ],
              }),
            )
            hash = await writeContractAsync({
              address: chainConfig.positionManager,
              abi: positionManagerAbi,
              functionName: 'multicall',
              args: [calls],
              chainId,
            })
          } else {
            const v4 = V4_BY_CHAIN.get(chainId)
            if (!v4) throw new Error('v4 is not available on this chain')
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_WINDOW
            hash = await writeContractAsync({
              address: v4.positionManager,
              abi: v4PositionManagerAbi,
              functionName: 'modifyLiquidities',
              args: [encodeV4Claim(batch), deadline],
              chainId,
            })
          }

          setState({ chainId, status: 'pending', hash, batch: progress })
          await waitForTransactionReceipt(wagmiConfig, { hash, chainId })
          claimed.push(...batch)
          setState({ chainId, status: 'success', hash, batch: progress })
        }

        return claimed
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error)
        setState({ chainId, status: 'error', error: raw.split('\n')[0] })
        // Batches already mined are genuinely claimed; report them so the UI can
        // drop exactly those rows rather than leaving stale fees on screen.
        return claimed
      }
    },
    [address, wagmiConfig, writeContractAsync],
  )

  return { claim, state, reset }
}
