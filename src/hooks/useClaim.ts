import { useCallback, useState } from 'react'
import { encodeFunctionData, maxUint128 } from 'viem'
import { useAccount, useConfig, useWriteContract } from 'wagmi'
import { switchChain, waitForTransactionReceipt } from 'wagmi/actions'
import { positionManagerAbi } from '../abi/positionManager'
import { CHAIN_BY_ID } from '../config/chains'
import type { Position } from '../lib/types'

/**
 * Every `collect()` moves up to two ERC-20 balances, so a batch costs roughly
 * 100–200k gas per position. Past this count a single transaction risks hitting
 * the block gas limit, so a large selection is split into sequential batches —
 * still far fewer transactions than claiming one position at a time.
 */
export const MAX_PER_TX = 25

export function batchCount(positionCount: number): number {
  return Math.ceil(positionCount / MAX_PER_TX)
}

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
 * Batches N `collect()` calls into one transaction through the position
 * manager's own `multicall`, so a single signature drains every selected
 * position on that chain.
 */
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

      const batches = chunk(positions, MAX_PER_TX)
      const claimed: Position[] = []

      try {
        setState({ chainId, status: 'switching' })
        await switchChain(wagmiConfig, { chainId })

        for (const [index, batch] of batches.entries()) {
          const progress = { index: index + 1, total: batches.length }

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

          setState({ chainId, status: 'signing', batch: progress })
          const hash = await writeContractAsync({
            address: chainConfig.positionManager,
            abi: positionManagerAbi,
            functionName: 'multicall',
            args: [calls],
            chainId,
          })

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
