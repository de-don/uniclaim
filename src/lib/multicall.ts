import type { Abi, PublicClient } from 'viem'

/** Contracts per multicall round-trip. Keeps bursts small enough for public RPCs. */
const CHUNK = 120
/** Calldata packed into a single eth_call; the viem default of 1024 is far too chatty. */
const BATCH_SIZE = 8192

export type Call = {
  address: `0x${string}`
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

/**
 * Runs a multicall in sequential chunks. A revert on a metadata call is normal
 * (not every ERC-20 has a string `symbol`), but a failure on a core protocol
 * read means the RPC let us down — and reporting that as "no positions" would
 * tell a user with unclaimed fees that they have none. Those stages throw.
 */
export async function readAll(
  client: PublicClient,
  contracts: readonly Call[],
  options: { label: string; tolerateFailures?: boolean },
): Promise<(unknown | undefined)[]> {
  const out: (unknown | undefined)[] = []
  let failures = 0

  for (let i = 0; i < contracts.length; i += CHUNK) {
    const results = (await client.multicall({
      // viem infers result types per literal contract tuple; this helper is
      // deliberately generic, so decoded values are cast at each call site.
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
    throw new Error(`${options.label}: ${failures} of ${contracts.length} calls failed`)
  }
  return out
}
