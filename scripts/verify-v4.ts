/**
 * Three independent checks on the v4 support, all against live chains:
 *
 * 1. Decoding — `getPositionLiquidity(tokenId)` from the position manager must
 *    equal the liquidity the pool reports for (poolId, manager, ticks, salt).
 *    That single equality only holds if the pool id, the 24-bit tick unpacking
 *    and the salt convention are all correct, so it catches any of them.
 * 2. Fees — positions are scanned end to end against live pool state.
 * 3. Claim encoding — the batched `modifyLiquidities` call is eth_called as the
 *    owner. A wrong action id, parameter layout or currency ordering reverts.
 *
 * Token ids are sampled from `nextTokenId` rather than looked up through the
 * explorer: discovery is a separate concern (and Robinhood Chain's explorer
 * refuses non-browser clients), while what needs proving here is the maths.
 */
import { createPublicClient, fallback, http, numberToHex, type PublicClient } from 'viem'
import { stateViewAbi, v4PositionManagerAbi } from '../src/abi/v4'
import { CHAINS, type ChainConfig } from '../src/config/chains'
import { V4_CHAINS, type V4Config } from '../src/config/v4'
import { formatAmount } from '../src/lib/format'
import { encodeV4Claim } from '../src/lib/v4/claim'
import { poolIdOf, scanV4TokenIds, unpackPositionInfo, type PoolKey } from '../src/lib/v4/scan'

let decodeChecks = 0
let decodeFails = 0
let scanned = 0
let simulated = 0
let simulationFails = 0

async function checkChain(chainConfig: ChainConfig, v4: V4Config) {
  const client = createPublicClient({
    chain: chainConfig.chain,
    transport: fallback(chainConfig.rpcUrls.map((url) => http(url, { retryCount: 3, retryDelay: 1500, timeout: 30_000 }))),
  }) as PublicClient

  console.log(`\n########## ${chainConfig.chain.name} ##########`)

  const next = (await client.readContract({
    address: v4.positionManager,
    abi: v4PositionManagerAbi,
    functionName: 'nextTokenId',
  })) as bigint

  const offsets = [2n, 8n, 40n, 200n, 900n, 4000n, 20_000n]
  const ids = offsets.map((o) => (next > o ? next - o : 1n))

  // Only ids that are still owned by somebody are worth checking.
  const owners = new Map<string, bigint[]>()
  for (const id of ids) {
    try {
      const owner = (await client.readContract({
        address: v4.positionManager, abi: v4PositionManagerAbi, functionName: 'ownerOf', args: [id],
      })) as `0x${string}`
      owners.set(owner, [...(owners.get(owner) ?? []), id])
    } catch {
      /* burned */
    }
  }

  for (const [owner, tokenIds] of owners) {
    // --- check 1: decoding consistency ------------------------------------
    for (const tokenId of tokenIds) {
      const [key, info] = (await client.readContract({
        address: v4.positionManager, abi: v4PositionManagerAbi, functionName: 'getPoolAndPositionInfo', args: [tokenId],
      })) as [PoolKey, bigint]
      const { tickLower, tickUpper } = unpackPositionInfo(info)
      const fromManager = (await client.readContract({
        address: v4.positionManager, abi: v4PositionManagerAbi, functionName: 'getPositionLiquidity', args: [tokenId],
      })) as bigint
      const [fromPool] = (await client.readContract({
        address: v4.stateView, abi: stateViewAbi, functionName: 'getPositionInfo',
        args: [poolIdOf(key), v4.positionManager, tickLower, tickUpper, numberToHex(tokenId, { size: 32 })],
      })) as [bigint, bigint, bigint]

      decodeChecks++
      const same = fromManager === fromPool
      if (!same) decodeFails++
      console.log(`  decode #${tokenId} ticks=[${tickLower},${tickUpper}] liquidity manager=${fromManager} pool=${fromPool} ${same ? 'MATCH' : 'MISMATCH'}`)
    }

    // --- check 2: fees ------------------------------------------------------
    const positions = await scanV4TokenIds(client, chainConfig, v4, tokenIds)
    scanned += positions.length
    for (const p of positions) {
      console.log(
        `  scan   #${p.tokenId} ${p.token0.symbol}/${p.token1.symbol} ${p.inRange ? 'in ' : 'out'} ` +
          `fees ${formatAmount(p.fees0, p.token0.decimals)} ${p.token0.symbol} + ${formatAmount(p.fees1, p.token1.decimals)} ${p.token1.symbol}` +
          (p.hooks && BigInt(p.hooks) !== 0n ? ` hooks=${p.hooks.slice(0, 10)}…` : ''),
      )
    }

    // --- check 3: claim simulation -----------------------------------------
    if (positions.length > 0) {
      const unlockData = encodeV4Claim(positions)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
      simulated++
      try {
        await client.simulateContract({
          address: v4.positionManager, abi: v4PositionManagerAbi, functionName: 'modifyLiquidities',
          args: [unlockData, deadline], account: owner as `0x${string}`,
        })
        console.log(`  claim  batch of ${positions.length} → simulation OK`)
      } catch (e) {
        simulationFails++
        const m = String((e as Error).message).split('\n').filter(Boolean)
        console.log(`  claim  batch of ${positions.length} → REVERTED: ${m[0]} ${m[1] ?? ''}`)
      }
      break
    }
  }
}

for (const v4 of V4_CHAINS) {
  const chainConfig = CHAINS.find((c) => c.chain.id === v4.chainId)
  if (!chainConfig) {
    console.log(`\n!! ${v4.chainId} has a v4 entry but no chain config`)
    continue
  }
  try {
    await checkChain(chainConfig, v4)
  } catch (e) {
    console.log(`  chain failed: ${String((e as Error).message).split('\n')[0].slice(0, 90)}`)
  }
}

console.log(
  `\n=== decode ${decodeChecks - decodeFails}/${decodeChecks} match · ${scanned} positions scanned · claim simulations ${simulated - simulationFails}/${simulated} OK ===`,
)
process.exit(decodeFails === 0 && simulationFails === 0 && decodeChecks > 0 ? 0 : 1)
