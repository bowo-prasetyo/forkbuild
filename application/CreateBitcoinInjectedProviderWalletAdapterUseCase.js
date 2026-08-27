import { BitcoinInjectedProviderWalletAdapter } from '../anchoring/BitcoinInjectedProviderWalletAdapter.js';

// 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX.
//
// Mirrors application/CreateBitcoinEsploraTransactionBroadcasterUseCase.js's
// own shape exactly, for the identical reason — a composition root ui/ or
// tests/ uses to get a concrete, real-wallet-backed connection provider
// without ever importing anchoring/BitcoinInjectedProviderWalletAdapter.js
// directly. The result plugs straight into
// application/CreateBitcoinWalletConnectionUseCase.js's own `provider`
// option. `injectedProvider` is left entirely to the caller — in ui/main.js
// this is `window.unisat` when present, `null` when it is not (a first-class,
// expected outcome — see anchoring/BitcoinInjectedProviderWalletAdapter.js's
// own header).
export class CreateBitcoinInjectedProviderWalletAdapterUseCase {
    execute({ injectedProvider } = {}) {
        const bitcoinInjectedProviderWalletAdapter = new BitcoinInjectedProviderWalletAdapter({ injectedProvider });

        return { bitcoinInjectedProviderWalletAdapter };
    }
}
