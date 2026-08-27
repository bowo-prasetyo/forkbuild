import { BitcoinAnchorFundingObservationState } from '../application/BitcoinAnchorFundingObservationState.js';

const TXID_PATTERN = /^[0-9a-f]{64}$/i;

// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
//
// anchoring/BitcoinAnchorTransactionBuilder.js's own header (0.8.47) named
// exactly this milestone, twice: "real funding information is always the
// CALLER's own" and, in docs/Roadmap.md's own "Deliberately excluded" list
// for that milestone, "Fetching real UTXOs for a real address is a future
// concern." Nothing in this codebase has ever obtained a real UTXO for a
// real address before now. This class is that missing piece, and nothing
// more than it:
//
//   a connected wallet's own `account` (0.8.58, UNCHANGED)
//        │
//        ▼
//   BitcoinWalletFundingObserver.observeFunding()      (THIS FILE — new)
//        │
//        ▼
//   injected `fundingSource`
//   (Esplora, a future backend, or a fake in every test)
//        │
//   ┌────┴──────────┬───────────────┐
//   ▼                ▼               ▼
// OBSERVED       UNSUPPORTED     UNAVAILABLE
//
// A SEPARATE, EXPLICITLY-TRIGGERED OBSERVATION — NEVER PART OF CONNECTING,
// SIGNING, OR PUBLISHING. Nothing in anchoring/BitcoinWalletConnection.js,
// anchoring/BitcoinAnchorWalletSigner.js, or application/
// BitcoinAnchorPublicationCoordinator.js calls this class, and this class
// never calls back into any of them — the identical restraint anchoring/
// BitcoinAnchorConfirmationObserver.js's own header already holds toward
// application/BitcoinAnchorPublicationCoordinator.js, one stage earlier in
// the pipeline. A caller decides when to ask, and asks again, explicitly,
// whenever it wants a fresher answer — there is no polling loop, timer, or
// automatic refresh anywhere in this file.
//
// A FUNDING OBSERVATION IS NOT A FUNDING COMMITMENT. `observeFunding()`
// holds no state across calls and returns a new, frozen record every time —
// it never remembers a previous OBSERVED result, and never lets one
// silently outlive an observation that would contradict it. The UTXOs named
// in one observation may already be spent, or new ones may have arrived, by
// the time a caller acts on it — this class reports what the funding source
// said AT `observedAt`, never a claim about the account's CURRENT state.
// See docs/Principles.md, "A Funding Observation Is Not A Funding
// Commitment (0.8.60)."
//
// SCRIPT TYPE IS READ FROM THE ADDRESS'S OWN PUBLIC PREFIX, NEVER DECODED.
// `anchoring/BitcoinAnchorTransactionBuilder.js` (0.8.47) and `anchoring/
// BitcoinAnchorPsbtBuilder.js` (0.8.48) both hold, unchanged, the identical
// restraint: "no base58/bech32 decoding exists anywhere in this codebase."
// This class does not break that restraint — `inferScriptTypeFromAddress()`
// below reads only the address's own human-readable prefix and length, the
// public, standardized encoding BIP173/BIP350 define for exactly this
// purpose (a bc1q.../tb1q... address IS, by definition, a P2WPKH witness
// program; a bc1p.../tb1p... address IS a P2TR one) — never the base58check
// or bech32 checksum/payload decoding that would be required to derive a
// real scriptPubKey. That gap is unchanged and still unbuilt: this class's
// own `scriptType` field is exactly the metadata anchoring/
// BitcoinAnchorTransactionBuilder.js's own `utxos[].scriptType` already
// accepts for fee ESTIMATION — it is never sufficient to construct a
// PSBT input, which still requires a real `witnessUtxo.scriptPubKey`
// (anchoring/BitcoinAnchorPsbtBuilder.js's own, unchanged requirement) that
// no class in this codebase can presently derive from an address alone.
// Wiring a real funding observation into that builder is real, separately
// sized future work — see docs/Roadmap.md's own "Deliberately excluded"
// list for this milestone.
//
// AN UNSUPPORTED ADDRESS FORMAT IS A REAL, HONEST OUTCOME, NEVER A GUESS.
// A P2SH address (mainnet "3...", testnet "2...") is a completely real,
// common wallet address ForkBuild simply has no fee-estimation table for
// (anchoring/BitcoinAnchorTransactionBuilder.js's own
// `INPUT_VBYTES_BY_SCRIPT_TYPE` names only p2wpkh/p2pkh/p2tr). Rather than
// silently default such an account to "p2wpkh" the way that builder's own
// PER-UTXO `scriptType` optionally does when omitted, this class reports
// the honest `UNSUPPORTED` outcome — never a fabricated guess a later fee
// estimate would silently rely on.
//
// CHANGE HAS NO SEPARATE WALLET CAPABILITY OF ITS OWN, DELIBERATELY. A
// connected wallet's OWN account is the one address this class already
// knows corresponds to a real signing capability (anchoring/
// BitcoinWalletConnection.js's own `.account`) — so `changeAccount` is
// always exactly the same `account` this observation was asked about,
// never a second, separately-obtained "change address" from a wallet API
// this codebase has no documented, verifiable contract for. A real wallet
// receiving its own change back is standard practice, not a compromise; see
// docs/Roadmap.md, "0.8.60 — Explicit Bitcoin Anchor Funding & Address
// Preparation," "Deliberately excluded," for why a second wallet capability
// is not built here.
//
// EVERY UTXO THE SOURCE REPORTS IS RE-VALIDATED, NEVER TAKEN AT FACE VALUE.
// `txid`/`vout`/`valueSats` are exactly the untrusted external claim
// anchoring/BitcoinAnchorConfirmationObserver.js's own header already
// treats block metadata as. A `fundingSource` that reports even ONE
// malformed entry fails the WHOLE observation as UNAVAILABLE — this class
// never silently drops a bad entry and reports the rest as if nothing were
// wrong, the same completeness anchoring/BitcoinAnchorPsbtBuilder.js's own
// `matchUtxoDetails()` already holds toward its own `utxoDetails` array.
//
// A `fundingSource` has exactly this shape — the identical injected-
// capability discipline anchoring/BitcoinAnchorConfirmationObserver.js
// already holds for confirmation, sized for what THIS class reads instead:
//
//   { fetchUtxos(account) ->
//       { found: true, utxos: [{ txid, vout, valueSats, confirmed }, ...] }
//     | { found: false [, reason] }
//     (sync return or Promise — observeFunding() always awaits it) }
//
// Throwing is tolerated as a last resort — observeFunding() catches it and
// reports the UNAVAILABLE form — mirroring exactly how anchoring/
// BitcoinAnchorConfirmationObserver.js already treats a throwing
// confirmationSource.
export class BitcoinWalletFundingObserver {
    constructor({ fundingSource } = {}) {
        if (!fundingSource || typeof fundingSource.fetchUtxos !== 'function') {
            throw new Error('BitcoinWalletFundingObserver: a funding source is required');
        }
        this._fundingSource = fundingSource;
    }

    // Resolves to exactly one, frozen, observation record:
    //
    //   { state: OBSERVED, account, network, scriptType, utxos,
    //     totalValueSats, changeAccount, reason: null, observedAt }
    //   { state: UNSUPPORTED, account, network, scriptType: null, utxos: [],
    //     totalValueSats: null, changeAccount: null, reason, observedAt }
    //   { state: UNAVAILABLE, account, network, scriptType: null, utxos: [],
    //     totalValueSats: null, changeAccount: null, reason, observedAt }
    //
    // `utxos` is always a frozen array of frozen `{ txid, vout, valueSats,
    // scriptType, confirmed }` records — `scriptType` on each entry mirrors
    // the observation's own top-level `scriptType`, since every UTXO
    // returned for one address necessarily shares that address's own script
    // type. `observedAt` is THIS call's own local clock, never a timestamp
    // the funding source itself reports — the identical restraint
    // anchoring/BitcoinAnchorConfirmationObserver.js's own header already
    // draws for its own `observedAt`.
    //
    // Throws only for a caller-contract violation — a missing/empty
    // `account` or `network` — checked before the injected fundingSource is
    // ever consulted. Never throws for the source's own operational
    // failure, or for a real but unsupported address format.
    async observeFunding({ account, network } = {}) {
        if (typeof account !== 'string' || !account.trim()) {
            throw new Error('BitcoinWalletFundingObserver: account must be a non-empty string');
        }
        if (typeof network !== 'string' || !network.trim()) {
            throw new Error('BitcoinWalletFundingObserver: network must be a non-empty string');
        }
        const observedAt = new Date();

        const scriptType = inferScriptTypeFromAddress(account);
        if (!scriptType) {
            return outcome(BitcoinAnchorFundingObservationState.UNSUPPORTED, {
                account, network, observedAt,
                reason: `account ${account} does not use a Bitcoin address format this codebase can estimate a fee for (supported: native segwit bc1q.../tb1q..., or taproot bc1p.../tb1p..., or legacy 1.../m.../n...)`
            });
        }

        let result;
        try {
            result = await this._fundingSource.fetchUtxos(account);
        } catch (error) {
            return outcome(BitcoinAnchorFundingObservationState.UNAVAILABLE, {
                account, network, observedAt, reason: error.message
            });
        }

        if (!result || typeof result !== 'object' || result.found !== true) {
            return outcome(BitcoinAnchorFundingObservationState.UNAVAILABLE, {
                account, network, observedAt,
                reason: (result && typeof result.reason === 'string' && result.reason)
                    || `funding source could not report UTXOs for account ${account}`
            });
        }

        let normalizedUtxos;
        try {
            normalizedUtxos = normalizeUtxos(result.utxos, scriptType);
        } catch (error) {
            return outcome(BitcoinAnchorFundingObservationState.UNAVAILABLE, {
                account, network, observedAt, reason: error.message
            });
        }

        const totalValueSats = normalizedUtxos.reduce((total, utxo) => total + utxo.valueSats, 0);

        return Object.freeze({
            state: BitcoinAnchorFundingObservationState.OBSERVED,
            account,
            network,
            scriptType,
            utxos: Object.freeze(normalizedUtxos),
            totalValueSats,
            changeAccount: account,
            reason: null,
            observedAt
        });
    }
}

function outcome(state, { account, network, observedAt, reason }) {
    return Object.freeze({
        state, account, network, scriptType: null, utxos: Object.freeze([]),
        totalValueSats: null, changeAccount: null, reason, observedAt
    });
}

function normalizeUtxos(utxos, scriptType) {
    if (!Array.isArray(utxos)) {
        throw new Error('BitcoinWalletFundingObserver: funding source reported utxos that is not an array');
    }
    return utxos.map((utxo, index) => {
        if (!utxo || typeof utxo !== 'object' || typeof utxo.txid !== 'string' || !TXID_PATTERN.test(utxo.txid)) {
            throw new Error(`BitcoinWalletFundingObserver: utxos[${index}].txid must be a 32-byte hex transaction id`);
        }
        if (!Number.isInteger(utxo.vout) || utxo.vout < 0) {
            throw new Error(`BitcoinWalletFundingObserver: utxos[${index}].vout must be a non-negative integer`);
        }
        if (!Number.isInteger(utxo.valueSats) || utxo.valueSats <= 0) {
            throw new Error(`BitcoinWalletFundingObserver: utxos[${index}].valueSats must be a positive integer`);
        }
        return Object.freeze({
            txid: utxo.txid.toLowerCase(),
            vout: utxo.vout,
            valueSats: utxo.valueSats,
            scriptType,
            confirmed: utxo.confirmed === true
        });
    });
}

// Reads ONLY the address's own public, human-readable prefix and length —
// the standardized BIP173 (segwit v0)/BIP350 (segwit v1, taproot) and
// base58check encodings already name a script type BY CONSTRUCTION. This is
// never the base58/bech32 checksum-and-payload decoding this codebase's
// anchoring/ layer still deliberately does not perform anywhere — see this
// file's own header. `null` for any address this class does not recognize
// as one of the three script types anchoring/
// BitcoinAnchorTransactionBuilder.js already knows how to estimate a fee
// for (a P2SH address, most notably) — never guessed at.
function inferScriptTypeFromAddress(address) {
    const lower = address.toLowerCase();
    if (lower.startsWith('bc1q') || lower.startsWith('tb1q')) {
        return address.length === 42 ? 'p2wpkh' : null; // 62 chars is a P2WSH program — unsupported
    }
    if (lower.startsWith('bc1p') || lower.startsWith('tb1p')) {
        return 'p2tr';
    }
    if (/^[1mn]/.test(address)) {
        return 'p2pkh';
    }
    return null;
}
