/**
 * The landing page's words, in one place. The React landing renders them, and
 * the build writes the same text into index.html as static markup (plus
 * FAQPage structured data), so a crawler reads exactly what a visitor sees and
 * the two cannot drift apart. Plain strings only: this module is also loaded by
 * vite.config.ts, outside the browser.
 */

export const CHAIN_COUNT = 10

export const HERO = {
  before: 'Claim Uniswap fees from ',
  accent: 'every position',
  after: ' in one transaction',
  lede:
    'UniClaim finds all of your Uniswap v3 and v4 positions across 10 chains, shows the fees you have ' +
    'earned but never collected, and collects them from multiple positions at once — one transaction ' +
    'per chain instead of one per position.',
}

export const STEPS = [
  {
    title: 'Connect your wallet — or just paste an address',
    text: 'Nothing is signed. Connecting only tells the app which address to look up, and any address or ENS name can be viewed without connecting at all.',
  },
  {
    title: 'We scan every chain',
    text: `Your v3 and v4 positions are read straight from the contracts on ${CHAIN_COUNT} chains, and the unclaimed fees are computed from live pool state.`,
  },
  {
    title: 'Check it, then claim in one transaction',
    text: 'Before your wallet opens you see the contract, the payout and the fee, simulated against the chain. Then every position on a chain goes out as one batched call.',
  },
]

export const GUIDE_PATH = '/guides/collect-uniswap-fees-multiple-positions'

/**
 * Written as the questions people actually type into a search box. Every
 * answer has to stay true — this is also what Google may quote back.
 */
export const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I claim fees from multiple Uniswap positions at once?',
    a: 'The Uniswap interface collects fees one position at a time, so twenty positions mean twenty transactions. UniClaim batches them instead: select the positions on a chain and every collect goes out in a single transaction — through the position manager\'s own multicall on v3, and a single modifyLiquidities call on v4.',
  },
  {
    q: 'Can I collect Uniswap v4 fees in one transaction?',
    a: 'Yes. v4 has no collect function; fees are realised by decreasing liquidity by zero and then closing each currency. UniClaim does that for every selected v4 position inside one unlock, so any number of v4 positions on a chain is claimed with one signature.',
  },
  {
    q: 'Does claiming fees close my position or remove liquidity?',
    a: 'No. Claiming only moves the fees that have already accrued. Your liquidity, your price range and the position itself stay exactly as they were, and the position keeps earning.',
  },
  {
    q: 'Is it safe? What do I sign?',
    a: 'No token approvals and no signed messages — the only thing you sign is the claim transaction itself. The app calls only Uniswap\'s own position managers, the payout can only go to the position\'s owner, and before your wallet opens the exact transaction is simulated against the chain so you see what it does. The source code is public.',
  },
  {
    q: 'Which chains are supported?',
    a: 'Ethereum, Arbitrum, Optimism, Polygon, Base, BNB Chain, Avalanche, Blast, Celo and Robinhood Chain for v3; v4 on all of them except Celo. On BNB Chain a v4 position is added by pasting its Uniswap link.',
  },
  {
    q: 'Does it cost anything?',
    a: 'No. UniClaim is free and takes no fee; you only pay the network gas for the claim transaction, and batching means paying it once per chain instead of once per position.',
  },
]
