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

export type GrowthInput = {
  tickLower: number
  tickUpper: number
  tickCurrent: number
  feeGrowthGlobalX128: bigint
  feeGrowthOutsideLowerX128: bigint
  feeGrowthOutsideUpperX128: bigint
}

/** Tick.getFeeGrowthInside: fees accrued per unit of liquidity inside a range. */
export function feeGrowthInside(input: GrowthInput): bigint {
  const {
    tickLower,
    tickUpper,
    tickCurrent,
    feeGrowthGlobalX128,
    feeGrowthOutsideLowerX128,
    feeGrowthOutsideUpperX128,
  } = input

  const below =
    tickCurrent >= tickLower
      ? feeGrowthOutsideLowerX128
      : subIn256(feeGrowthGlobalX128, feeGrowthOutsideLowerX128)

  const above =
    tickCurrent < tickUpper
      ? feeGrowthOutsideUpperX128
      : subIn256(feeGrowthGlobalX128, feeGrowthOutsideUpperX128)

  return subIn256(subIn256(feeGrowthGlobalX128, below), above)
}

/**
 * Fees accrued since a position's checkpoint, plus anything already set aside
 * for it. v4 has no `tokensOwed`, so it passes nothing for the last argument.
 */
export function feesFromCheckpoint(
  liquidity: bigint,
  insideX128: bigint,
  insideLastX128: bigint,
  tokensOwed = 0n,
): bigint {
  return tokensOwed + (liquidity * subIn256(insideX128, insideLastX128)) / Q128
}
