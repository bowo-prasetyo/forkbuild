const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// 0.9.425 — Arweave Proof/Anchoring Provider Implementation.
//
// anchoring/ArweaveAnchorPublisher.js (creation) and anchoring/
// ArweaveTransactionDataProofVerifier.js (verification) are this
// codebase's Arweave-specific anchor adapters. This is the third: a
// PRESENTATION adapter, registered into application/
// ExternalAnchorEvidenceViewRegistry.js under the identical anchorType
// (`arweave`) those two already use — the same third, independent axis
// anchoring/BitcoinAnchorEvidenceView.js already established for Bitcoin,
// held here for Arweave.
//
// THIS CLASS NEVER VERIFIES. It never calls a gateway, never checks
// whether the transaction exists, and never decides whether `proof` is
// genuine — all three stay anchoring/ArweaveTransactionDataProofVerifier.js's
// own job, unchanged. `describe()` is a pure string/URL transform over
// whatever `proof` the anchor already carries.
//
// A malformed or missing `proof` (a peer-supplied anchor this replica has
// never independently checked, or one whose publisher never populated
// one) is described HONESTLY, never guessed at — `fields`/
// `externalLocator` degrade to "not available," never a fabricated txid.
export class ArweaveAnchorEvidenceView {
    get anchorType() { return 'arweave'; }

    // Returns:
    //
    //   { summary: 'Arweave',
    //     fields: [{ label, value }, ...],
    //     externalLocator: { label: 'View on block explorer', url } | null }
    //
    // `externalLocator` is null whenever `proof.txid` is not a
    // recognizable Arweave transaction id — there is nothing honest to
    // link to.
    describe(anchor) {
        const proof = anchor && anchor.proof && typeof anchor.proof === 'object' ? anchor.proof : {};
        const txid = typeof proof.txid === 'string' && TRANSACTION_ID_PATTERN.test(proof.txid) ? proof.txid : null;

        return {
            summary: 'Arweave',
            fields: [
                { label: 'Transaction ID', value: txid || 'not available' }
            ],
            externalLocator: txid ? { label: 'View on block explorer', url: explorerUrl(txid) } : null
        };
    }
}

// viewblock.io's own path convention for an Arweave transaction — this is
// string construction only, never a live network call — see this file's
// own header.
function explorerUrl(txid) {
    return `https://viewblock.io/arweave/tx/${txid}`;
}
