const CANDIDATES: Record<string, string[]> = {
  '1': ['https://eth.llamarpc.com', 'https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://rpc.ankr.com/eth'],
  '42161': ['https://arbitrum.llamarpc.com', 'https://arbitrum-one-rpc.publicnode.com', 'https://arbitrum.drpc.org', 'https://arb1.arbitrum.io/rpc'],
  '10': ['https://optimism.llamarpc.com', 'https://optimism-rpc.publicnode.com', 'https://optimism.drpc.org', 'https://mainnet.optimism.io'],
  '137': ['https://polygon.llamarpc.com', 'https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org', 'https://polygon-rpc.com'],
  '8453': ['https://base.llamarpc.com', 'https://base-rpc.publicnode.com', 'https://base.drpc.org', 'https://mainnet.base.org'],
  '56': ['https://binance.llamarpc.com', 'https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org', 'https://bsc-dataseed.binance.org'],
  '43114': ['https://avalanche-c-chain-rpc.publicnode.com', 'https://avalanche.drpc.org', 'https://api.avax.network/ext/bc/C/rpc'],
  '42220': ['https://forno.celo.org', 'https://celo.drpc.org', 'https://celo-rpc.publicnode.com'],
  '81457': ['https://rpc.blast.io', 'https://blast-rpc.publicnode.com', 'https://blast.drpc.org'],
}

// A real batched eth_call is the only meaningful probe: plenty of endpoints
// answer eth_chainId and then reject Multicall3 payloads.
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11'
const AGGREGATE3_UNI_SYMBOL =
  '0x82ad56cb0000000000000000000000000000000000000000000000000000000000000020' +
  '0000000000000000000000000000000000000000000000000000000000000001' +
  '0000000000000000000000000000000000000000000000000000000000000020' +
  '000000000000000000000000ca11bde05977b3631167028862be2a173976ca11' +
  '0000000000000000000000000000000000000000000000000000000000000001' +
  '0000000000000000000000000000000000000000000000000000000000000060' +
  '0000000000000000000000000000000000000000000000000000000000000004' +
  '0f28c97d00000000000000000000000000000000000000000000000000000000'

for (const [chainId, urls] of Object.entries(CANDIDATES)) {
  const results: string[] = []
  for (const url of urls) {
    const started = Date.now()
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: MULTICALL3, data: AGGREGATE3_UNI_SYMBOL }, 'latest'] }),
        signal: AbortSignal.timeout(8000),
      })
      const json = await response.json() as { result?: string; error?: { message: string } }
      const ms = Date.now() - started
      if (json.result) results.push(`  OK   ${String(ms).padStart(5)}ms  ${url}`)
      else results.push(`  ERR          ${url} → ${json.error?.message?.slice(0, 50)}`)
    } catch (e) {
      results.push(`  DEAD         ${url} → ${String((e as Error).message).slice(0, 50)}`)
    }
  }
  console.log(`chain ${chainId}`)
  console.log(results.join('\n'))
}
