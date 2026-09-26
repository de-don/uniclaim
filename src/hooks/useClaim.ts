import { useCallback, useState } from 'react'
import { BaseError, UserRejectedRequestError } from 'viem'
import { useAccount, useConfig, useWriteContract } from 'wagmi'
import { switchChain, waitForTransactionReceipt } from 'wagmi/actions'
import { CHAIN_BY_ID } from '../config/chains'
import { buildClaimCall, planBatches } from '../lib/claimTx'
import type { Position } from '../lib/types'

export { batchCount, MAX_PER_TX, planBatches } from '../lib/claimTx'

export type ClaimOutcome = 'success' | 'cancelled' | 'error'

export type ClaimState = {
  chainId: number | null
  status: 'idle' | 'switching' | 'signing' | 'pending' | ClaimOutcome
  hash?: `0x${string}`
  error?: string
  /** 1-based progress when a claim spans several transactions. */
  batch?: { index: number; total: number }
}

export type ClaimResult = {
  chainId: number
  claimed: Position[]
  outcome: ClaimOutcome
  hashes: `0x${string}`[]
  error?: string
}

export function useClaim() {
  const { address } = useAccount()
  const wagmiConfig = useConfig()
  const { writeContractAsync } = useWriteContract()
  const [state, setState] = useState<ClaimState>({ chainId: null, status: 'idle' })

  const reset = useCallback(() => setState({ chainId: null, status: 'idle' }), [])

  const claim = useCallback(
    async (chainId: number, positions: Position[]): Promise<ClaimResult> => {
      if (!address || positions.length === 0 || !CHAIN_BY_ID.has(chainId)) {
        return { chainId, claimed: [], outcome: 'error', hashes: [], error: 'Wallet not ready' }
      }

      const plan = planBatches(positions)
      const claimed: Position[] = []
      const hashes: `0x${string}`[] = []

      try {
        setState({ chainId, status: 'switching' })
        await switchChain(wagmiConfig, { chainId })

        for (const [index, planned] of plan.entries()) {
          const progress = { index: index + 1, total: plan.length }
          setState({ chainId, status: 'signing', batch: progress })

          const { version: _version, ...call } = buildClaimCall(chainId, planned, address)
          const hash = await writeContractAsync({ ...call, chainId } as Parameters<
            typeof writeContractAsync
          >[0])

          hashes.push(hash)
          setState({ chainId, status: 'pending', hash, batch: progress })
          const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId })
          // A mined transaction can still have reverted; its positions were not claimed.
          if (receipt.status !== 'success') throw new Error('The transaction reverted on chain')
          claimed.push(...planned.batch)
          setState({ chainId, status: 'success', hash, batch: progress })
        }

        return { chainId, claimed, outcome: 'success', hashes }
      } catch (error) {
        const cancelled = isRejection(error)
        const message = cancelled ? undefined : describeError(error)
        setState(
          cancelled
            ? { chainId, status: 'cancelled' }
            : { chainId, status: 'error', error: message },
        )
        // Batches already mined are genuinely claimed; report them so the UI can
        // drop exactly those rows rather than leaving stale fees on screen.
        return { chainId, claimed, outcome: cancelled ? 'cancelled' : 'error', hashes, error: message }
      }
    },
    [address, wagmiConfig, writeContractAsync],
  )

  return { claim, state, reset }
}

/**
 * Declining in the wallet is a decision, not a failure, and showing it in red
 * next to the word "Failed" reads as if something went wrong with the funds.
 */
function isRejection(error: unknown): boolean {
  if (error instanceof BaseError) {
    return Boolean(error.walk((e) => e instanceof UserRejectedRequestError))
  }
  return (error as { code?: unknown } | null)?.code === 4001
}

/** viem's short message is the human part; the full one carries calldata and docs links. */
export function describeError(error: unknown): string {
  if (error instanceof BaseError) return error.shortMessage
  const raw = error instanceof Error ? error.message : String(error)
  return raw.split('\n')[0]
}
