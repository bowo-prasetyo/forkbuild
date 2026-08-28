import { BaseInjectedProviderWalletTransactionSigner } from '../base/BaseInjectedProviderWalletTransactionSigner.js';

// 0.8.93 — Explicit Base Reviewed Transaction Signing.
//
// Mirrors `application/CreateBaseInjectedProviderWalletAdapterUseCase.js`'s
// own shape exactly (0.8.90) — a composition root `ui/` or `tests/` uses
// to get a concrete, real-wallet-backed signing capability without ever
// importing `base/BaseInjectedProviderWalletTransactionSigner.js`
// directly. `injectedProvider` is left entirely to the caller — in
// `ui/main.js` this is the SAME `window.ethereum` (or `null`) already
// handed to `CreateBaseInjectedProviderWalletAdapterUseCase`, one shared
// browser capability read twice for two deliberately separate purposes:
// connecting an account (0.8.90) and signing a transaction (this
// milestone) — never one object doing both. See `base/
// BaseWalletConnection.js`'s own header on why account identity is never
// widened into a signing capability.
export class CreateBaseInjectedProviderWalletTransactionSignerUseCase {
    execute({ injectedProvider } = {}) {
        const baseInjectedProviderWalletTransactionSigner = new BaseInjectedProviderWalletTransactionSigner({ injectedProvider });

        return { baseInjectedProviderWalletTransactionSigner };
    }
}
