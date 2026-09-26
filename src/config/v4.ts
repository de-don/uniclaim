import { arbitrum, avalanche, base, blast, bsc, mainnet, optimism, polygon, robinhood } from 'wagmi/chains'

/**
 * Uniswap v4 deployments. Unlike v3, the position manager is not
 * ERC721Enumerable — there is no `tokenOfOwnerByIndex` — so a wallet's position
 * ids cannot be read from the contract at all. They have to come from something
 * that indexes Transfer events without an API key and answers with CORS
 * headers: a public Blockscout instance, or Routescan's etherscan-compatible
 * API where Blockscout has no instance.
 *
 * Where neither exists (BNB Chain), positions can still be added by pasting
 * their Uniswap link. Either way the source is never trusted: it can only
 * suggest ids, and each one is confirmed against `ownerOf` on chain before
 * anything is shown or claimed.
 */
export type V4Config = {
  chainId: number
  positionManager: `0x${string}`
  poolManager: `0x${string}`
  /** Periphery contract exposing PoolManager storage as ordinary view calls. */
  stateView: `0x${string}`
  /** Where candidate ids come from; null when only pasted links can add them. */
  discovery: V4Discovery | null
}

export type V4Discovery = { kind: 'blockscout'; url: string } | { kind: 'routescan' }

export const V4_CHAINS: V4Config[] = [
  {
    chainId: mainnet.id,
    positionManager: '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
    poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    stateView: '0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227',
    discovery: { kind: 'blockscout', url: 'https://eth.blockscout.com' },
  },
  {
    chainId: arbitrum.id,
    positionManager: '0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869',
    poolManager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
    stateView: '0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990',
    discovery: { kind: 'blockscout', url: 'https://arbitrum.blockscout.com' },
  },
  {
    chainId: optimism.id,
    positionManager: '0x3C3Ea4B57a46241e54610e5f022E5c45859A1017',
    poolManager: '0x9a13F98Cb987694C9F086b1F5eB990EeA8264Ec3',
    stateView: '0xc18a3169788F4F75A170290584ECA6395C75Ecdb',
    // optimism.blockscout.com now 301s here, and a browser drops a cross-origin
    // redirect that carries no CORS header — the lookup failed on every load.
    discovery: { kind: 'blockscout', url: 'https://explorer.optimism.io' },
  },
  {
    chainId: polygon.id,
    positionManager: '0x1Ec2eBf4F37E7363FDfe3551602425af0B3ceef9',
    poolManager: '0x67366782805870060151383F4BbFF9daB53e5cD6',
    stateView: '0x5eA1bD7974c8A611cBAB0bDCAFcB1D9CC9b3BA5a',
    discovery: { kind: 'blockscout', url: 'https://polygon.blockscout.com' },
  },
  {
    /**
     * Robinhood Chain deploys v4 at its own addresses, like it does v3. The
     * position manager was found from the NFTs an address actually holds, and
     * cross-checked: its `poolManager()` is the same singleton that emits the
     * v4 Swap events on this chain. Two StateView contracts point at that
     * PoolManager (the other is 0x0284cb0b…); both are read-only views, so
     * either serves.
     */
    chainId: robinhood.id,
    positionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7',
    poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
    stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',
    discovery: { kind: 'blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
  {
    chainId: base.id,
    positionManager: '0x7C5f5A4bBd8fD63184577525326123B519429bDc',
    poolManager: '0x498581fF718922c3f8e6A244956aF099B2652b2b',
    stateView: '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71',
    discovery: { kind: 'blockscout', url: 'https://base.blockscout.com' },
  },
  /*
   * The three below were checked on chain before being added: `name()` is
   * "Uniswap v4 Positions NFT", and the position manager's `poolManager()` and
   * the StateView's both return the PoolManager listed here.
   */
  {
    chainId: avalanche.id,
    positionManager: '0xb74b1f14d2754acfcbbe1a221023a5cf50ab8acd',
    poolManager: '0x06380c0e0912312b5150364b9dc4542ba0dbbc85',
    stateView: '0xc3c9e198c735a4b97e3e683f391ccbdd60b69286',
    discovery: { kind: 'routescan' },
  },
  {
    chainId: blast.id,
    positionManager: '0x4ad2f4cca2682cbb5b950d660dd458a1d3f1baad',
    poolManager: '0x1631559198a9e474033433b2958dabc135ab6446',
    stateView: '0x12a88ae16f46dce4e8b15368008ab3380885df30',
    discovery: { kind: 'routescan' },
  },
  {
    // No key-free source lists NFTs here: no Blockscout instance, Routescan
    // does not cover it, BscScan needs a key and public nodes refuse
    // eth_getLogs past a few thousand blocks. Pasted links are the way in.
    chainId: bsc.id,
    positionManager: '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b',
    poolManager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df',
    stateView: '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4',
    discovery: null,
  },
]

export const V4_BY_CHAIN = new Map(V4_CHAINS.map((c) => [c.chainId, c]))

/** v4 exists on more chains than this; these are the ones we can read. */
export function hasV4(chainId: number): boolean {
  return V4_BY_CHAIN.has(chainId)
}
