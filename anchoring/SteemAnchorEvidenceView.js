import { STEEM_ANCHOR_TYPE, parseSteemAnchorProof, steemAnchorTarget, steemTransactionAnchors } from '../core/SteemAnchor.js';
import { checkSteemBlockEvidence } from '../core/SteemBlockEvidence.js';

// Describes a `steem` anchor for the anchor evidence panel, like
// anchoring/ArweaveAnchorEvidenceView.js. It never calls a node and never
// decides whether the anchor is genuine; anchoring/SteemProofVerifier.js
// does that. It always says what backs a Steem anchor, since it is weaker
// than a Bitcoin one (docs/Protocol.md, "Proposed: Steem Anchoring").
//
// When the proof keeps block evidence, `describe()` checks it offline
// (core/SteemBlockEvidence.js) and shows the block's own time, witness and
// signing key from it. `describeVerification()` and `describeFinality()`
// turn what the verifier and the finality observer report into sentences.
export class SteemAnchorEvidenceView {
    get anchorType() { return STEEM_ANCHOR_TYPE; }

    describe(anchor) {
        const parsed = parseSteemAnchorProof(anchor?.proof);
        const valid = !parsed.error;
        const fields = [
            { label: 'Block', value: valid ? String(parsed.blockNum) : 'not available' },
            { label: 'Transaction ID', value: valid ? parsed.trxId : 'not available' }
        ];
        if (valid && parsed.batchPath) {
            fields.push({ label: 'Batch', value: `One of several Publications anchored together (a Merkle path of ${parsed.batchPath.length} step${parsed.batchPath.length === 1 ? '' : 's'})` });
        }
        if (valid) fields.push(...evidenceFields(parsed, anchor?.contentHash));
        fields.push({ label: 'Attested by', value: 'Steem witnesses (elected by stake, not proof of work)' });
        return {
            summary: 'Steem',
            fields,
            externalLocator: valid ? { label: 'View block on SteemWorld', url: `https://steemworld.org/block/${parsed.blockNum}` } : null
        };
    }

    // A sentence for a verification result's `details`, or null.
    describeVerification(details) {
        if (!details || typeof details !== 'object') return null;
        const parts = [];
        if (details.timestamp) {
            parts.push(`Recorded in Steem block ${details.blockNum} at ${formatSteemTime(details.timestamp)} by witness ${details.witness}.`);
        }
        if (Number.isSafeInteger(details.nodesAsked)) {
            parts.push(details.nodesAsked === 1
                ? 'One API node was asked; add another in Network Settings → Steem to compare nodes.'
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
        const block = finality.blockNum ? `Steem block ${finality.blockNum}` : 'The Steem block';
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
    const checked = checkSteemBlockEvidence(parsed.evidence, parsed);
    if (!checked.ok) return [{ label: 'Kept block evidence', value: `Doesn't check out: ${checked.reason}` }];
    let carries = true;
    if (typeof contentHash === 'string') {
        try {
            carries = steemTransactionAnchors(checked.transaction, steemAnchorTarget(contentHash, parsed.batchPath));
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

// "2026-09-26T10:00:03" → "2026-09-26 10:00:03 UTC".
export function formatSteemTime(text) {
    return typeof text === 'string' ? `${text.replace('T', ' ')} UTC` : 'unknown';
}
