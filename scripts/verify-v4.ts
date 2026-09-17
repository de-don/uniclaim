/**
 * Three independent checks on the v4 support, all against live chains:
 *
 * 1. Decoding — `getPositionLiquidity(tokenId)` from the position manager must
 *    equal the liquidity the pool reports for (poolId, manager, ticks, salt).
 *    That single equality only holds if the pool id, the tick unpacking and the
 *    salt convention are all correct, so it catches any of them being wrong.
 * 2. Fees — positions are scanned end to end and printed.
 * 3. Claim encoding — the batched `modifyLiquidities` call is eth_called as the
 *    owner. A wrong action id, parameter layout or currency ordering reverts.
 */
import { createPublicClient, fallback, http, numberToHex, type PublicClient } from 'viem'
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'
import { stateViewAbi, v4PositionManagerAbi } from '../src/abi/v4'
import { CHAINS } from '../src/config/chains'
import { V4_BY_CHAIN } from '../src/config/v4'
import { formatAmount } from '../src/lib/format'
import { encodeV4Claim } from '../src/lib/v4/claim'
import { discoverV4TokenIds } from '../src/lib/v4/discover'
import { poolIdOf, scanChainV4, unpackPositionInfo, type PoolKey } from '../src/lib/v4/scan'

let decodeChecks = 0
let decodeFails = 0
let scanned = 0
let simulated = 0
let simulationFails = 0

for (const chain of [mainnet, arbitrum, optimism, polygon, base]) {
  const chainConfig = CHAINS.find((c) => c.chain.id === chain.id)!
  const v4 = V4_BY_CHAIN.get(chain.id)!
  const client = createPublicClient({
    chain,
    transport: fallback(chainConfig.rpcUrls.map((url) => http(url, { retryCount: 2 }))),
  }) as PublicClient

  console.log(`\n########## ${chain.name} ##########`)

  // Recent token ids are far likelier to be live positions than old ones, so
  // the sample is anchored to nextTokenId rather than fixed.
  const next = (await client.readContract({
    address: v4.positionManager,
    abi: v4PositionManagerAbi,
    functionName: 'nextTokenId',
  })) as bigint
  const offsets = [1n, 5n, 25n, 120n, 600n, 2500n, 12000n]
  const sampleIds = offsets.map((o) => (next > o ? next - o : 1n))

  const owners = new Set<`0x${string}`>()
  for (const id of sampleIds) {
    try {
      owners.add(
        (await client.readContract({
          address: v4.positionManager,
          abi: v4PositionManagerAbi,
          functionName: 'ownerOf',
          args: [id],
        })) as `0x${string}`,
      )
    } catch {
      /* id not minted on this chain */
    }
  }

  for (const owner of owners) {
    let tokenIds: bigint[]
    try {
      tokenIds = await discoverV4TokenIds(client, v4, owner)
    } catch (e) {
      console.log(`  discovery failed for ${owner}: ${(e as Error).message}`)
      continue
    }
    if (tokenIds.length === 0) continue

    // --- check 1: decoding consistency -------------------------------------
    for (const tokenId of tokenIds.slice(0, 3)) {
      const [key, info] = (await client.readContract({
        address: v4.positionManager,
        abi: v4PositionManagerAbi,
        functionName: 'getPoolAndPositionInfo',
        args: [tokenId],
      })) as [PoolKey, bigint]
      const { tickLower, tickUpper } = unpackPositionInfo(info)
      const fromManager = (await client.readContract({
        address: v4.positionManager,
        abi: v4PositionManagerAbi,
        functionName: 'getPositionLiquidity',
        args: [tokenId],
      })) as bigint
      const [fromPool] = (await client.readContract({
        address: v4.stateView,
        abi: stateViewAbi,
        functionName: 'getPositionInfo',
        args: [
          poolIdOf(key),
          v4.positionManager,
          tickLower,
          tickUpper,
          numberToHex(tokenId, { size: 32 }),
        ],
      })) as [bigint, bigint, bigint]

      decodeChecks++
      const same = fromManager === fromPool
      if (!same) decodeFails++
      console.log(
        `  decode #${tokenId} ticks=[${tickLower},${tickUpper}] liquidity manager=${fromManager} pool=${fromPool} ${same ? 'MATCH' : 'MISMATCH'}`,
      )
    }

    // --- check 2: full scan -------------------------------------------------
    const positions = await scanChainV4(client, chainConfig, v4, owner)
    scanned += positions.length
    for (const p of positions.slice(0, 4)) {
      console.log(
        `  scan   #${p.tokenId} ${p.token0.symbol}/${p.token1.symbol} ${p.inRange ? 'in ' : 'out'} ` +
          `fees ${formatAmount(p.fees0, p.token0.decimals)} ${p.token0.symbol} + ` +
          `${formatAmount(p.fees1, p.token1.decimals)} ${p.token1.symbol}` +
          (p.hooks && BigInt(p.hooks) !== 0n ? ` hooks=${p.hooks.slice(0, 10)}…` : ''),
      )
    }

    // --- check 3: claim simulation -----------------------------------------
    if (positions.length > 0) {
      const batch = positions.slice(0, 5)
      const unlockData = encodeV4Claim(batch)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
      simulated++
      try {
        await client.simulateContract({
          address: v4.positionManager,
          abi: v4PositionManagerAbi,
          functionName: 'modifyLiquidities',
          args: [unlockData, deadline],
          account: owner,
        })
        console.log(`  claim  batch of ${batch.length} → simulation OK`)
      } catch (e) {
        simulationFails++
        const m = String((e as Error).message).split('\n').filter(Boolean)
        console.log(`  claim  batch of ${batch.length} → REVERTED: ${m[0]} ${m[1] ?? ''}`)
      }
      break
    }
  }
}

console.log(
  `\n=== decode ${decodeChecks - decodeFails}/${decodeChecks} match · ${scanned} positions scanned · claim simulations ${simulated - simulationFails}/${simulated} OK ===`,
)
process.exit(decodeFails === 0 && simulationFails === 0 && decodeChecks > 0 ? 0 : 1)
