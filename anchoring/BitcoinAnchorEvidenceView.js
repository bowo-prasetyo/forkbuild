const TXID_PATTERN = /^[0-9a-f]{64}$/i;

// 0.8.14 — External Evidence Inspection & Locator UX.
//
// anchoring/BitcoinAnchorPublisher.js (creation, 0.8.9) and anchoring/
// BitcoinOpReturnProofVerifier.js (verification, 0.8.1) are this
// codebase's existing Bitcoin-specific adapters. This is the third: a
// PRESENTATION adapter, registered into application/
// ExternalAnchorEvidenceViewRegistry.js under the identical anchorType
// (`bitcoin-op-return`) those two already use, answering a narrower
// question than either — "how should a `{ txid, network }` proof read on
// a screen, and where does 'view external evidence' go?" — never
// anything about whether the transaction exists, is confirmed, or
// belongs to this publication.
//
// THIS CLASS NEVER VERIFIES. It never calls a block explorer, never
// checks confirmations, never decides whether `proof` is genuine — all
// three stay anchoring/BitcoinOpReturnProofVerifier.js's own job,
// unchanged. `describe()` is a pure string/URL transform over whatever
// `proof` the anchor already carries, exactly as synchronous and
// side-effect-free as application/PublicationAnchorDetailView.js's own
// `publicationAnchorDetailView()`. See tests/
// PublicationAnchorInspectionUX.test.js's own invariant section.
//
// A malformed or missing `proof` (a peer-supplied anchor this replica
// has never independently checked, or one whose publisher never
// populated one) is described HONESTLY, never guessed at — `fields`/
// `externalLocator` degrade to "not available," never a fabricated txid.
export class BitcoinAnchorEvidenceView {
    get anchorType() { return 'bitcoin-op-return'; }

    // Returns:
    //
    //   { summary: 'Bitcoin',
    //     fields: [{ label, value }, ...],
    //     externalLocator: { label: 'View on block explorer', url } | null }
    //
    // `externalLocator` is null whenever `proof.txid` is not a
    // recognizable 32-byte hex transaction id — there is nothing honest
    // to link to. The explorer URL construction lives HERE and nowhere
    // else — never in application/PublicationAnchorDetailView.js, whose
    // own header states it never reinterprets `proof` at all.
    describe(anchor) {
        const proof = anchor && anchor.proof && typeof anchor.proof === 'object' ? anchor.proof : {};
        const txid = typeof proof.txid === 'string' && TXID_PATTERN.test(proof.txid) ? proof.txid : null;
        const network = typeof proof.network === 'string' && proof.network.trim() ? proof.network : null;

        return {
            summary: 'Bitcoin',
            fields: [
                { label: 'Network', value: network || 'unknown' },
                { label: 'Transaction ID', value: txid || 'not available' }
            ],
            externalLocator: txid ? { label: 'View on block explorer', url: explorerUrl(network, txid) } : null
        };
    }
}

// mempool.space's own path convention: mainnet transactions live at
// `/tx/:txid`, every other named network (testnet, signet) at
// `/<network>/tx/:txid`. This is string construction only, never a live
// network call — see this file's own header.
function explorerUrl(network, txid) {
    const path = !network || network === 'mainnet' ? `/tx/${txid}` : `/${network}/tx/${txid}`;
    return `https://mempool.space${path}`;
}
