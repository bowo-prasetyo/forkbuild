import { BLURT_ANCHOR_TYPE, blurtAnchorTarget, blurtTransactionAnchors, parseBlurtAnchorProof } from '../core/BlurtAnchor.js';
import { checkBlurtBlockEvidence } from '../core/BlurtBlockEvidence.js';
import { blurtPostUrl } from '../core/BlurtPost.js';
import { formatSteemTime } from './SteemAnchorEvidenceView.js';

// Describes a `blurt` anchor for the anchor evidence panel, as
// anchoring/SteemAnchorEvidenceView.js does for Steem. It never calls a node
// and never decides whether the anchor is genuine;
// anchoring/BlurtProofVerifier.js does that. It always says what backs a
// Blurt anchor, since it is weaker than a Bitcoin one, and links to the post
// that made the anchor when the proof names one.
export class BlurtAnchorEvidenceView {
    get anchorType() { return BLURT_ANCHOR_TYPE; }

    describe(anchor) {
        const parsed = parseBlurtAnchorProof(anchor?.proof);
        const valid = !parsed.error;
        const fields = [
            { label: 'Block', value: valid ? String(parsed.blockNum) : 'not available' },
            { label: 'Transaction ID', value: valid ? parsed.trxId : 'not available' }
        ];
        if (valid && parsed.post) {
            fields.push({ label: 'Post', value: `@${parsed.post.author}/${parsed.post.permlink}` });
        }
        if (valid && parsed.batchPath) {
            fields.push({ label: 'Batch', value: `One of several Publications anchored together (a Merkle path of ${parsed.batchPath.length} step${parsed.batchPath.length === 1 ? '' : 's'})` });
        }
        if (valid) fields.push(...evidenceFields(parsed, anchor?.contentHash));
        fields.push({ label: 'Attested by', value: 'Blurt witnesses (elected by stake, not proof of work)' });
        return {
            summary: 'Blurt',
            fields,
            externalLocator: valid && parsed.post ? { label: 'View the post on Blurt', url: blurtPostUrl(parsed.post.author, parsed.post.permlink) } : null
        };
    }

    // A sentence for a verification result's `details`, or null.
    describeVerification(details) {
        if (!details || typeof details !== 'object') return null;
        const parts = [];
        if (details.timestamp) {
            parts.push(`Recorded in Blurt block ${details.blockNum} at ${formatSteemTime(details.timestamp)} by witness ${details.witness}.`);
        }
        if (Number.isSafeInteger(details.nodesAsked)) {
            parts.push(details.nodesAsked === 1
                ? 'One API node was asked; add another in Network Settings → Blurt to compare nodes.'
                : `${details.nodesAgreeing} of ${details.nodesAsked} API nodes answered and agree.`);
        }
        if (details.evidence) {
            parts.push(details.evidence.ok
                ? 'The kept block evidence checks out offline.'
                : `The kept block evidence doesn't check out: ${details.evidence.reason}.`);
        }
        return parts.length > 0 ? parts.join(' ') : null;
    }

    // `{ label, message }` for a finality observer's state, or null.
    describeFinality(finality) {
        if (!finality || typeof finality !== 'object') return null;
        const block = finality.blockNum ? `Blurt block ${finality.blockNum}` : 'The Blurt block';
        switch (finality.state) {
            case 'pending':
                return {
                    label: 'Waiting for finality',
                    message: `${block} holds the anchor but isn't final yet${Number.isSafeInteger(finality.lastIrreversible) ? ` (the last final block is ${finality.lastIrreversible})` : ''}. It usually is within about a minute.`
                };
            case 'final':
                return { label: 'Anchored', message: `${block} is final${finality.timestamp ? ` (recorded at ${formatSteemTime(finality.timestamp)})` : ''}, so the chain can no longer undo this anchor.` };
            case 'dropped':
                return { label: 'Not anchored', message: `${block} became final without the anchor's transaction, so it was dropped. Create the anchor again.` };
            default:
                return { label: 'Finality unknown', message: `Couldn't tell whether ${block.charAt(0).toLowerCase() + block.slice(1)} is final${finality.reason ? `: ${finality.reason}` : ''}. Verify the evidence later.` };
        }
    }
}

function evidenceFields(parsed, contentHash) {
    if (!parsed.evidence) return [{ label: 'Kept block evidence', value: 'Not kept' }];
    const checked = checkBlurtBlockEvidence(parsed.evidence, parsed);
    if (!checked.ok) return [{ label: 'Kept block evidence', value: `Doesn't check out: ${checked.reason}` }];
    let carries = true;
    if (typeof contentHash === 'string') {
        try {
            carries = blurtTransactionAnchors(checked.transaction, blurtAnchorTarget(contentHash, parsed.batchPath));
        } catch {
            carries = false;
        }
    }
    return [
        { label: 'Block time', value: formatSteemTime(checked.timestamp) },
        { label: 'Witness', value: checked.witness },
        { label: 'Signing key', value: checked.signingKey },
        {
            label: 'Kept block evidence',
            value: carries
                ? 'Checks out offline: the header is signed by the key above and commits to the anchor transaction. Whether that key was the witness\'s, and the block is final, needs a node (Verify Evidence).'
                : "Doesn't check out: the kept transaction doesn't carry this anchor"
        }
    ];
}
