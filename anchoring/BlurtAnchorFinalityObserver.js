import { SteemAnchorFinalityObserver } from './SteemAnchorFinalityObserver.js';
import { BLURT_ANCHOR_TYPE, parseBlurtAnchorProof } from '../core/BlurtAnchor.js';

// Watches a freshly created `blurt` anchor until its block is irreversible
// (docs/Protocol.md, "Proposed: Blurt Substrate", "Anchoring"). Blurt's
// blocks become final as Steem's do, so this is Steem's observer reading
// Blurt proofs from a Blurt node. It proves nothing to anyone else;
// anchoring/BlurtProofVerifier.js checks an anchor.
export class BlurtAnchorFinalityObserver extends SteemAnchorFinalityObserver {
    constructor(options = {}) {
        super({ ...options, anchorType: BLURT_ANCHOR_TYPE, parseProof: parseBlurtAnchorProof });
    }
}
