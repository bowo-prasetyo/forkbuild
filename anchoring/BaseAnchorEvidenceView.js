const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

// 0.9.511 — Base Anchor Evidence View.
//
// anchoring/BaseAnchorPublisher.js (creation, 0.9.470) and anchoring/
// BaseProofVerifier.js (verification, 0.9.463) are this codebase's
// existing Base-specific anchor adapters. This is the third: a
// PRESENTATION adapter, registered into application/
// ExternalAnchorEvidenceViewRegistry.js under the identical anchorType
// (`base`) those two already use — the same third, independent axis
// anchoring/BitcoinAnchorEvidenceView.js (0.8.14) and anchoring/
// ArweaveAnchorEvidenceView.js (0.9.425) already established for Bitcoin
// and Arweave, held here for Base. Both are the direct templates this
// class follows line for line; see tests/
// ProofAnchoringCrossSubstrateCapabilityParityAudit.test.js Section G,
// the audit that named this exact file as the one real, narrow product
// gap in an otherwise-complete Base anchoring/proof/catalog pipeline.
//
// THIS CLASS NEVER VERIFIES. It never calls a Base RPC endpoint, never
// decodes a transaction's own `input`, and never decides whether `proof`
// is genuine — all three stay anchoring/BaseProofVerifier.js's own job,
// unchanged. `describe()` is a pure string/URL transform over whatever
// `proof` the anchor already carries, exactly as synchronous and
// side-effect-free as anchoring/BitcoinAnchorEvidenceView.js's own
// `describe()`. See ui/views/DecentralizedPublicationsView.js's own
// `toggleInspect()` — the one caller, invoked only when a person clicks
// "Inspect Evidence" on an already-cataloged anchor, never on creation
// and never as part of verification.
//
// A malformed or missing `proof` (a peer-supplied anchor this replica
// has never independently checked, or one whose publisher never
// populated one) is described HONESTLY, never guessed at — `fields`/
// `externalLocator` degrade to "not available," never a fabricated txid.
export class BaseAnchorEvidenceView {
    get anchorType() { return 'base'; }

    // Returns:
    //
    //   { summary: 'Base',
    //     fields: [{ label, value }, ...],
    //     externalLocator: { label: 'View on block explorer', url } | null }
    //
    // `externalLocator` is null whenever `proof.txid` is not a
    // recognizable 32-byte hex transaction hash — there is nothing
    // honest to link to. The explorer URL construction lives HERE and
    // nowhere else — never in application/PublicationAnchorDetailView.js,
    // whose own header states it never reinterprets `proof` at all.
    describe(anchor) {
        const proof = anchor && anchor.proof && typeof anchor.proof === 'object' ? anchor.proof : {};
        const txid = typeof proof.txid === 'string' && TX_HASH_PATTERN.test(proof.txid) ? proof.txid : null;
        const network = typeof proof.network === 'string' && proof.network.trim() ? proof.network : null;

        return {
            summary: 'Base',
            fields: [
                { label: 'Network', value: network || 'unknown' },
                { label: 'Transaction Hash', value: txid || 'not available' }
            ],
            externalLocator: txid ? { label: 'View on block explorer', url: explorerUrl(network, txid) } : null
        };
    }
}

// basescan.org's own path convention: mainnet transactions live at
// `/tx/:txid`, the testnet (Base Sepolia) at `sepolia.basescan.org/tx/:txid`
// — mirroring anchoring/BitcoinAnchorEvidenceView.js's own mempool.space
// convention one chain over. This is string construction only, never a
// live network call — see this file's own header.
function explorerUrl(network, txid) {
    const host = network === 'testnet' ? 'sepolia.basescan.org' : 'basescan.org';
    return `https://${host}/tx/${txid}`;
}
