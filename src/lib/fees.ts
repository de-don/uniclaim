const Q128 = 1n << 128n
const TWO_256 = 1n << 256n

/**
 * Uniswap's fee accounting relies on unchecked uint256 subtraction: the
 * accumulators are allowed to overflow and only their difference is meaningful.
 * Reproducing that wraparound is mandatory — a plain `a - b` in JS goes negative
 * and yields nonsense for any pool whose accumulator has wrapped.
 */
export function subIn256(a: bigint, b: bigint): bigint {
  const diff = a - b
  return diff < 0n ? diff + TWO_256 : diff
}

/**
 * v4 exposes `feeGrowthInside` directly through StateView, so the tick walk that
 * v3 needs is unnecessary there — only the delta against the position's last
 * checkpoint remains. Fees are never parked in a `tokensOwed` field in v4.
 */
export function feesFromGrowth(
  liquidity: bigint,
  insideX128: bigint,
  insideLastX128: bigint,
): bigint {
  return (liquidity * subIn256(insideX128, insideLastX128)) / Q128
}

export type FeeInput = {
  liquidity: bigint
  tickLower: number
  tickUpper: number
  tickCurrent: number
  feeGrowthGlobalX128: bigint
  feeGrowthOutsideLowerX128: bigint
  feeGrowthOutsideUpperX128: bigint
  feeGrowthInsideLastX128: bigint
  tokensOwed: bigint
}

/** Uncollected fees for one side of a position, in token base units. */
export function uncollectedFees(input: FeeInput): bigint {
  const {
    liquidity,
    tickLower,
    tickUpper,
    tickCurrent,
    feeGrowthGlobalX128,
    feeGrowthOutsideLowerX128,
    feeGrowthOutsideUpperX128,
    feeGrowthInsideLastX128,
    tokensOwed,
  } = input

  const below =
    tickCurrent >= tickLower
      ? feeGrowthOutsideLowerX128
      : subIn256(feeGrowthGlobalX128, feeGrowthOutsideLowerX128)

  const above =
    tickCurrent < tickUpper
      ? feeGrowthOutsideUpperX128
      : subIn256(feeGrowthGlobalX128, feeGrowthOutsideUpperX128)

  const inside = subIn256(subIn256(feeGrowthGlobalX128, below), above)
  const delta = subIn256(inside, feeGrowthInsideLastX128)

  return tokensOwed + (liquidity * delta) / Q128
}
