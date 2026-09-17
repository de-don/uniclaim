/**
 * Ground truth for the fee math: compare what `scanChain` computes from pool
 * state against what the position manager itself returns from an eth_call of
 * `collect()` made as the owner. Any drift here is a bug in fees.ts.
 */
import { createPublicClient, fallback, http, maxUint128, type PublicClient } from 'viem'
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'
import { positionManagerAbi } from '../src/abi/positionManager'
import { CHAINS } from '../src/config/chains'
import { scanChain } from '../src/lib/scan'

const ownerAbi = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
] as const

const TARGETS: [typeof mainnet, bigint[]][] = [
  [mainnet, [1000n, 120000n, 250000n, 400000n, 640000n, 900000n, 960000n]],
  [arbitrum, [100000n, 500000n, 1200000n, 2000000n, 3500000n]],
  [base, [5000n, 100000n, 400000n, 900000n, 1600000n]],
  [optimism, [10000n, 200000n, 500000n, 800000n]],
  [polygon, [50000n, 300000n, 700000n, 1200000n]],
]

let checked = 0
let mismatches = 0
const chainErrors: string[] = []

for (const [chain, sampleIds] of TARGETS) {
  const config = CHAINS.find((c) => c.chain.id === chain.id)!
  const client = createPublicClient({
    chain,
    transport: fallback(config.rpcUrls.map((url) => http(url, { retryCount: 2, retryDelay: 400 }))),
  }) as PublicClient

  console.log(`\n########## ${chain.name} ##########`)

  const owners = new Set<`0x${string}`>()
  for (const id of sampleIds) {
    try {
      owners.add(
        (await client.readContract({
          address: config.positionManager,
          abi: ownerAbi,
          functionName: 'ownerOf',
          args: [id],
        })) as `0x${string}`,
      )
    } catch {
      /* burned id */
    }
  }

  let checkedHere = 0
  for (const owner of owners) {
    let positions
    try {
      positions = (await scanChain(client, config, owner)).positions
    } catch (error) {
      const message = (error as Error).message
      console.log(`  scan failed for ${owner}: ${message}`)
      chainErrors.push(`${chain.name}: ${message}`)
      continue
    }
    if (positions.length === 0) continue
    console.log(`\n  owner ${owner} → ${positions.length} position(s) with fees`)

    for (const p of positions.slice(0, 4)) {
      const { result } = await client.simulateContract({
        address: config.positionManager,
        abi: positionManagerAbi,
        functionName: 'collect',
        args: [{ tokenId: p.tokenId, recipient: owner, amount0Max: maxUint128, amount1Max: maxUint128 }],
        account: owner,
      })
      const [truth0, truth1] = result as [bigint, bigint]
      const match = truth0 === p.fees0 && truth1 === p.fees1
      checked++
      checkedHere++
      if (!match) mismatches++
      console.log(
        `    #${p.tokenId} ${p.token0.symbol}/${p.token1.symbol} ${p.inRange ? 'in ' : 'out'} ` +
          (match
            ? `MATCH (${p.fees0} / ${p.fees1})`
            : `MISMATCH\n      computed ${p.fees0} / ${p.fees1}\n      onchain  ${truth0} / ${truth1}`),
      )
    }
    if (checkedHere >= 8) break
  }
}

console.log(`\n=== ${checked} positions checked, ${mismatches} mismatches ===`)
if (chainErrors.length) console.log(`(${chainErrors.length} scan error(s) surfaced, not swallowed)`)
process.exit(mismatches === 0 && checked > 0 ? 0 : 1)
