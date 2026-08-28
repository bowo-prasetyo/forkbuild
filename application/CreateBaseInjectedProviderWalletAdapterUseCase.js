import { BaseInjectedProviderWalletAdapter } from '../base/BaseInjectedProviderWalletAdapter.js';

// 0.8.90 — Explicit Base Network & Account Observation.
//
// Mirrors application/CreateBitcoinInjectedProviderWalletAdapterUseCase.js's
// own shape exactly (0.8.58), one chain over — a composition root ui/ or
// tests/ uses to get a concrete, real-wallet-backed connection provider
// without ever importing base/BaseInjectedProviderWalletAdapter.js
// directly. The result plugs straight into application/
// CreateBaseWalletConnectionUseCase.js's own `provider` option.
// `injectedProvider` is left entirely to the caller — in ui/main.js this is
// `window.ethereum` when present, `null` when it is not (a first-class,
// expected outcome — see base/BaseInjectedProviderWalletAdapter.js's own
// header).
export class CreateBaseInjectedProviderWalletAdapterUseCase {
    execute({ injectedProvider } = {}) {
        const baseInjectedProviderWalletAdapter = new BaseInjectedProviderWalletAdapter({ injectedProvider });

        return { baseInjectedProviderWalletAdapter };
    }
}
