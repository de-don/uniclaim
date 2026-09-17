import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import App from './App'
import { Preview } from './components/Preview'
import { config } from './wagmi'

const queryClient = new QueryClient()

// Layout harness for development only; never reachable in a production build.
const isPreview = import.meta.env.DEV && window.location.hash === '#preview'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#ff007a', borderRadius: 'medium' })}>
          {isPreview ? <Preview /> : <App />}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
