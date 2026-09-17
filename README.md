# UniClaim

Claim the unclaimed fees from **every** Uniswap v3 and v4 position you own — one transaction per
chain.

The app is entirely client-side: no backend, no account, no API keys. Almost everything is read
straight from the contracts over public RPC endpoints; the one exception is v4 position discovery,
explained below.

## How it works

1. **Finding positions.** For v3: `NonfungiblePositionManager.balanceOf` → `tokenOfOwnerByIndex` →
   `positions(tokenId)` across 10 chains, all batched through Multicall3.

   v4 is not enumerable — its position manager is not ERC721Enumerable, so there is no
   `tokenOfOwnerByIndex` and no contract call that lists what an address holds. The only key-free,
   CORS-enabled source of that list is a public Blockscout instance, so candidate ids come from
   there and are then confirmed against `ownerOf` on chain. The explorer is treated as an untrusted
   hint: it returns numbers, every number is verified, and a wrong answer can only cost a lookup.

   Alternatives that were measured and rejected:

   | Source | Why not |
   | --- | --- |
   | `eth_getLogs` over Transfer events | Only Arbitrum's official RPC allows a full-range query. Elsewhere the cap is 2,000–10,000 blocks, or an archive token is required — for Base that is roughly 13,000 requests per scan. |
   | Revert Finance API | `access-control-allow-origin` is `https://revert.finance`, so a browser on any other origin cannot read the response; the preflight confirms it. The `uniswapv4` route exists, but returned an empty set for an address holding six verified v4 positions, so it would need a server-side proxy *and* would still not answer. |
   | The Graph, Alchemy, Ankr NFT APIs | All require an API key, which means a key shipped to the browser or a backend to hold it. |
2. **Computing fees.** The contract's `tokensOwed` goes stale the moment a position is touched, so
   the live figure is derived from pool state:

   ```
   feeGrowthInside = feeGrowthGlobal − feeGrowthBelow − feeGrowthAbove
   fees            = tokensOwed + liquidity × (feeGrowthInside − feeGrowthInsideLast) / 2¹²⁸
   ```

   Uniswap lets these accumulators overflow on purpose (unchecked uint256), so every subtraction is
   done modulo 2²⁵⁶ — see `src/lib/fees.ts`. The upside of this approach is that every call is a
   `view`, so the whole scan batches through Multicall3, unlike an `eth_call` of `collect()` which
   has to come from the owner.
   For v4, `feeGrowthInside` is available directly from the `StateView` periphery contract, so the
   tick walk is unnecessary and only the delta against the position's checkpoint remains. v4 keeps
   no `tokensOwed`.

3. **Claiming.** On v3 the selected `collect()` calls are encoded into a `bytes[]` and submitted as
   a single `NonfungiblePositionManager.multicall`. On v4 there is no `collect`: fees are realised
   by decreasing liquidity by zero and then closing each currency, all inside one `modifyLiquidities`
   unlock — one DECREASE_LIQUIDITY per position, then one CLOSE_CURRENCY per distinct currency.
   Closing per currency rather than per pool matters, since two positions sharing a token would
   otherwise try to withdraw the same credit twice.

Neither path takes a recipient this app could redirect: v3 `collect` pays the position's owner, and
v4's CLOSE_CURRENCY credits the transaction sender. (`TAKE_ALL`, the obvious v4 candidate, is a
router action the position manager rejects with `UnsupportedAction`.)

## Chains

**v3** — Ethereum, Arbitrum, Optimism, Polygon, Base, BNB Chain, Avalanche, Celo, Blast, Robinhood
Chain.

**v4** — Ethereum, Arbitrum, Optimism, Polygon, Base. v4 is deployed on BNB Chain, Avalanche and
Blast too, but none of them has a public explorer that can list an address's NFTs without an API
key, so positions there cannot be discovered and the app says so rather than showing an empty list.

Robinhood Chain runs a v4 `PoolManager` (`0x8366a39C…`) but no canonical v4 position-manager NFT was
found — liquidity there is modified by many bespoke contracts rather than the standard one — and its
Blockscout instance sits behind a Cloudflare challenge, so discovery would fail regardless. v3 is
supported there; v4 is not.

The `NonfungiblePositionManager` address is pinned per chain, but the v3 factory address is read out
of the manager itself — so a typo in one constant cannot silently redirect the maths at some other
pool.

Most chains reuse the canonical `0xC36442b4…` manager address. Robinhood Chain does not: that
address there holds an unrelated 2 kB contract that answers no calls, and the real deployment lives
at `0x73991a25…` with its own factory. It was located by tracing the `sender` of v3 pool `Mint`
events, then confirmed three ways — `name()` returns `Uniswap V3 Positions NFT-V1`,
`supportsInterface(0x780e9d63)` is true so enumeration works, and the bytecode matches Ethereum's
byte length exactly, differing only where constructor immutables are baked in. Adding a chain is
therefore not a matter of assuming the usual address.

## Running it

```bash
pnpm install
cp .env.example .env    # optional: WalletConnect id and your own RPC endpoints
pnpm dev
```

## Verifying the maths

```bash
pnpm verify        # v3: computed fees vs. the chain itself
pnpm verify:v4     # v4: decoding, fees and claim encoding
pnpm check:rpcs    # probe the bundled public endpoints with a real Multicall3 call
```

`pnpm verify` checks v3 fees against ground truth: for every position it finds, it `eth_call`s
`collect()` as the owner and requires a wei-exact match, across real wallets on 5 chains.

v4 has no read-only equivalent of `collect`, so `pnpm verify:v4` checks it three other ways:

1. **Decoding.** `getPositionLiquidity(tokenId)` from the position manager must equal the liquidity
   the pool reports for `(poolId, manager, ticks, salt)`. That equality only holds if the pool id,
   the 24-bit tick unpacking and the salt convention are all correct, so one comparison covers all
   three.
2. **Fees.** Positions are scanned end to end against live pools.
3. **Claim encoding.** The batched `modifyLiquidities` call is `eth_call`ed as the owner; a wrong
   action id, parameter layout or currency ordering reverts.

## Limitations

- **No v2.** v2 has no separate fees — they are reinvested into the LP token and cannot be claimed
  without withdrawing liquidity.
- **v4 discovery needs an explorer.** See the chain list above; without one, a chain shows v3 only.
- **v3 fees arrive as WETH.** `collect` pays out WETH rather than native ETH; unwrapping would need
  a separate `unwrapWETH9` inside the same multicall. v4 pools using native ETH pay out native ETH.
- **Gas batching.** More than `MAX_PER_TX` (25) positions on one chain will not fit in a single
  transaction, so they are sent as consecutive batches. A selection spanning both v3 and v4 also
  needs one transaction per protocol.
- **Public RPCs.** A wallet with more than 400 positions on one chain is scanned partially — set
  your own endpoint via `VITE_RPC_<chainId>`.

## Layout

```
src/
  abi/             v3 and v4 contract ABIs
  config/          chains, contract addresses, vetted public RPC lists
  lib/fees.ts      fee maths (wraparound arithmetic), shared by both versions
  lib/multicall.ts chunked batching that surfaces RPC failures instead of hiding them
  lib/scan.ts      v3 position scanner
  lib/v4/          v4 discovery, scanner and claim encoding
  lib/prices.ts    DefiLlama prices (no key) for USD estimates
  hooks/           all-chain scanning, claiming
  components/      landing, chain group, position row, info panel
scripts/
  verify-fees.ts   v3 ground-truth check against the chain
  verify-v4.ts     v4 decoding, fee and claim-encoding checks
  check-rpcs.ts    public endpoint probe
```
