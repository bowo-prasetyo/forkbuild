import { BitcoinWalletConnection } from '../anchoring/BitcoinWalletConnection.js';

// 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX.
//
// Mirrors application/CreateBitcoinAnchorWalletSignerUseCase.js's own
// shape exactly, for the identical reason — a composition root ui/ or
// tests/ uses to get a concrete BitcoinWalletConnection without ever
// importing anchoring/BitcoinWalletConnection.js directly. The caller
// still supplies the `provider` itself — this use case wires the
// connection, never the browser-extension capability behind it (see
// anchoring/BitcoinWalletConnection.js's own header on why that stays
// entirely the caller's own, real or fake, exactly as `wallet` already
// does for anchoring/BitcoinAnchorWalletSigner.js).
export class CreateBitcoinWalletConnectionUseCase {
    execute({ provider } = {}) {
        const bitcoinWalletConnection = new BitcoinWalletConnection({ provider });

        return { bitcoinWalletConnection };
    }
}
