# UniClaim

Claim the unclaimed fees from **every** Uniswap v3 position you own — one transaction per chain.

The app is entirely client-side: no backend, no indexer, no API keys. Everything is read straight
from the contracts over public RPC endpoints.

## How it works

1. **Finding positions.** `NonfungiblePositionManager.balanceOf` → `tokenOfOwnerByIndex` →
   `positions(tokenId)` for each of 9 chains, all batched through Multicall3.
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
3. **Claiming.** The selected `collect()` calls are encoded into a `bytes[]` and submitted as a
   single `NonfungiblePositionManager.multicall` — one signature, one gas fee.

The recipient is always the owner's own address: the Uniswap contract offers no way to send the
fees anywhere else.

## Chains

Ethereum, Arbitrum, Optimism, Polygon, Base, BNB Chain, Avalanche, Celo, Blast.

The `NonfungiblePositionManager` address is pinned per chain, but the factory address is read out of
the manager itself — so a typo in one constant cannot silently redirect the maths at some other pool.

## Running it

```bash
pnpm install
cp .env.example .env    # optional: WalletConnect id and your own RPC endpoints
pnpm dev
```

## Verifying the maths

`pnpm verify` checks the computed fees against ground truth: for every position it finds, it
`eth_call`s `collect()` as the owner and requires a wei-exact match. The script covers real wallets
on 5 chains.

```bash
pnpm verify
pnpm check:rpcs   # probe the bundled public endpoints with a real Multicall3 call
```

## Limitations

- **v3 only.** v4 support is in progress. v2 has no separate fees — they are reinvested into the LP
  token and cannot be claimed without withdrawing liquidity.
- **Fees arrive as WETH.** `collect` pays out WETH rather than native ETH; unwrapping would need a
  separate `unwrapWETH9` inside the same multicall.
- **Gas batching.** More than `MAX_PER_TX` (25) positions on one chain will not fit in a single
  transaction, so they are sent as consecutive batches.
- **Public RPCs.** A wallet with more than 400 positions on one chain is scanned partially — set
  your own endpoint via `VITE_RPC_<chainId>`.

## Layout

```
src/
  abi/           position manager, factory, pool and ERC-20 ABIs
  config/        chains, manager addresses, vetted public RPC lists
  lib/fees.ts    fee maths (wraparound arithmetic)
  lib/scan.ts    per-chain position scanner
  lib/prices.ts  DefiLlama prices (no key) for USD estimates
  hooks/         all-chain scanning, claiming
  components/    landing, chain group, position row, info panel
scripts/
  verify-fees.ts ground-truth check against the chain
  check-rpcs.ts  public endpoint probe
```
