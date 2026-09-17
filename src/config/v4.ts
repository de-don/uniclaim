import { arbitrum, base, mainnet, optimism, polygon, robinhood } from 'wagmi/chains'

/**
 * Uniswap v4 deployments. Unlike v3, the position manager is not
 * ERC721Enumerable — there is no `tokenOfOwnerByIndex` — so a wallet's position
 * ids cannot be read from the contract at all. They have to come from something
 * that indexes Transfer events, and the only key-free option that answers with
 * CORS headers is a public Blockscout instance.
 *
 * That means v4 is only offered on chains where such an instance exists. The
 * explorer is never trusted: it can suggest ids, and each one is then confirmed
 * against `ownerOf` on chain before anything is shown or claimed.
 */
export type V4Config = {
  chainId: number
  positionManager: `0x${string}`
  poolManager: `0x${string}`
  /** Periphery contract exposing PoolManager storage as ordinary view calls. */
  stateView: `0x${string}`
  explorer: string
}

export const V4_CHAINS: V4Config[] = [
  {
    chainId: mainnet.id,
    positionManager: '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e',
    poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    stateView: '0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227',
    explorer: 'https://eth.blockscout.com',
  },
  {
    chainId: arbitrum.id,
    positionManager: '0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869',
    poolManager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
    stateView: '0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990',
    explorer: 'https://arbitrum.blockscout.com',
  },
  {
    chainId: optimism.id,
    positionManager: '0x3C3Ea4B57a46241e54610e5f022E5c45859A1017',
    poolManager: '0x9a13F98Cb987694C9F086b1F5eB990EeA8264Ec3',
    stateView: '0xc18a3169788F4F75A170290584ECA6395C75Ecdb',
    explorer: 'https://optimism.blockscout.com',
  },
  {
    chainId: polygon.id,
    positionManager: '0x1Ec2eBf4F37E7363FDfe3551602425af0B3ceef9',
    poolManager: '0x67366782805870060151383F4BbFF9daB53e5cD6',
    stateView: '0x5eA1bD7974c8A611cBAB0bDCAFcB1D9CC9b3BA5a',
    explorer: 'https://polygon.blockscout.com',
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
    explorer: 'https://robinhoodchain.blockscout.com',
  },
  {
    chainId: base.id,
    positionManager: '0x7C5f5A4bBd8fD63184577525326123B519429bDc',
    poolManager: '0x498581fF718922c3f8e6A244956aF099B2652b2b',
    stateView: '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71',
    explorer: 'https://base.blockscout.com',
  },
]

export const V4_BY_CHAIN = new Map(V4_CHAINS.map((c) => [c.chainId, c]))

/** v4 exists on more chains than this; these are the ones we can enumerate. */
export function hasV4(chainId: number): boolean {
  return V4_BY_CHAIN.has(chainId)
}
