import { STEEM_ANCHOR_TYPE, parseSteemAnchorProof } from '../core/SteemAnchor.js';

// Describes a `steem` anchor's proof for the anchor evidence panel, like
// anchoring/ArweaveAnchorEvidenceView.js. It never calls a node and never
// decides whether the proof is genuine; anchoring/SteemProofVerifier.js
// does that. It always says what backs a Steem anchor, since it is weaker
// than a Bitcoin one (docs/Protocol.md, "Proposed: Steem Anchoring").
export class SteemAnchorEvidenceView {
    get anchorType() { return STEEM_ANCHOR_TYPE; }

    describe(anchor) {
        const parsed = parseSteemAnchorProof(anchor?.proof);
        const valid = !parsed.error;
        return {
            summary: 'Steem',
            fields: [
                { label: 'Block', value: valid ? String(parsed.blockNum) : 'not available' },
                { label: 'Transaction ID', value: valid ? parsed.trxId : 'not available' },
                { label: 'Attested by', value: 'Steem witnesses (elected by stake, not proof of work)' }
            ],
            externalLocator: valid ? { label: 'View block on SteemWorld', url: `https://steemworld.org/block/${parsed.blockNum}` } : null
        };
    }
}
