import { Publication } from '../../publisher/Publication.js';
import { ContentReference } from '../../core/ContentReference.js';
import { WorldEncounterKind } from '../../core/WorldEncounter.js';
import { describePublicationClaimLocator } from '../../core/ForkBuildAppLinks.js';
import { verifyWorldEncounterMaterial, WorldEncounterMaterialVerificationStatus } from '../worldEncounter/WorldEncounterMaterialVerification.js';
import { SnapshotCandidateDiscoveryOutcome } from '../snapshot/SnapshotCandidateDiscoveryOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { StoreSnapshotContentOutcome } from '../snapshot/materialization/StoreSnapshotContentOutcome.js';

// Opening a Publication from a link (`#/view/steem/<author>/<permlink>`,
// `#/view/ar/<id>` or `#/view/ipfs/<cid>`: the notice on a Steem post, or a
// link shared with Share; docs/Protocol.md, "Proposed: Steem Content
// Storage"). World View shows only Publications whose signature checks out,
// so the link names the Signed Claim, and the build is found from it:
//
//   1. read the claim where it is stored (`retrieveClaim(locator)`: Steem,
//      Arweave or IPFS);
//   2. verify it with the same verifier World discovery uses;
//   3. find its Snapshot: already on this device, at the claim's own
//      locator, or among announced Snapshot candidates (Nostr, Arweave,
//      Steem) with the claim's content hash;
//   4. check and keep the Snapshot locally (StoreSnapshotContentUseCase);
//   5. admit the Publication as World discovery does (the discovery
//      provider and the durable admission log).
//
// World View then loads the Publication like any other. Nothing here trusts
// where the claim came from: the signature and the content hash decide.

export const OpenPublicationLinkOutcome = Object.freeze({
    OPENED: 'opened',
    INVALID_LINK: 'invalid-link',
    CLAIM_UNAVAILABLE: 'claim-unavailable',
    UNREACHABLE: 'unreachable',
    NOT_A_PUBLICATION: 'not-a-publication',
    NOT_VERIFIED: 'not-verified',
    BUILD_NOT_FOUND: 'build-not-found'
});

const Outcome = OpenPublicationLinkOutcome;
const NETWORK_NAMES = Object.freeze({ steem: 'Steem', arweave: 'Arweave', ipfs: 'IPFS' });
// Said when a claim can't be found yet, per network.
const NOT_FOUND_HINTS = Object.freeze({
    steem: 'or it can\'t be read',
    arweave: 'or it isn\'t available yet: a new Arweave upload can take a few minutes to appear',
    ipfs: 'or no IPFS gateway can reach it right now'
});
// Said when a network can't be reached, per network.
const UNREACHABLE_HINTS = Object.freeze({
    steem: '',
    arweave: '',
    ipfs: ' A gateway can take a while to find content kept on someone\'s own IPFS node, so try again. If it keeps failing, add another gateway in Network Settings (for example your pinning service\'s own gateway) so there is one more to fall back to.'
});
const CANDIDATE_STORAGE_ORDER = ['steem', 'ar', 'ipfs'];

// `locator` is where the Signed Claim is stored; `retrieveClaim(locator)`
// resolves to its JSON, null when it isn't there, or rejects when the
// network can't be reached.
export async function openPublicationLink({
    locator,
    retrieveClaim, verifier,
    hasLocalContent = async () => false,
    findSnapshotCandidates = null, resolveSnapshotCandidate = null,
    storeSnapshotContent,
    discoveryProvider = null, admissionLog = null
}) {
    const where = describePublicationClaimLocator(locator);
    if (!where) return failure(Outcome.INVALID_LINK, 'This link does not name a Publication ForkBuild can open.');
    const network = NETWORK_NAMES[where.network];

    let material;
    try {
        material = await retrieveClaim(where.locator);
    } catch (error) {
        return failure(Outcome.UNREACHABLE, `${network} could not be reached to read ${where.label}: ${error.message}.${UNREACHABLE_HINTS[where.network]}`.replace(/\.\.(\s|$)/, '.$1'));
    }
    if (material === null || material === undefined) {
        return failure(Outcome.CLAIM_UNAVAILABLE, `${where.label} is not a Publication stored on ${network} by ForkBuild, ${NOT_FOUND_HINTS[where.network]}.`);
    }

    let publication = null;
    try {
        publication = material instanceof Publication ? material : Publication.fromJSON(material);
    } catch {
        // Reported just below.
    }
    if (!publication || !publication.id || !publication.documentId || !publication.contentHash) {
        return failure(Outcome.NOT_A_PUBLICATION, `${where.label} does not hold a ForkBuild Publication.`);
    }

    const verification = await verifyWorldEncounterMaterial({
        resolvedSelection: Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, origin: `dweb:${where.network}:${where.locator}` }),
        material: publication,
        verifier
    });
    if (verification.status !== WorldEncounterMaterialVerificationStatus.VERIFIED) {
        return failure(Outcome.NOT_VERIFIED, verification.status === WorldEncounterMaterialVerificationStatus.REJECTED
            ? `The signature on "${publication.title}" does not check out, so it isn't shown.`
            : `"${publication.title}" is not signed, so it isn't shown.`, publication);
    }

    const contentHash = publication.contentReference?.hash ?? publication.contentHash;
    const found = await findSnapshot({ publication, contentHash, hasLocalContent, findSnapshotCandidates, resolveSnapshotCandidate, storeSnapshotContent });
    if (!found.ok) return failure(Outcome.BUILD_NOT_FOUND, found.message, publication);

    // As World discovery admits a verified Publication: each sink on its
    // own, so one failing never stops the other.
    for (const sink of [discoveryProvider, admissionLog]) {
        try {
            sink?.add(publication);
        } catch {
            // The Publication is still shown this time from the other sink.
        }
    }
    return Object.freeze({ outcome: Outcome.OPENED, publication, documentId: publication.documentId, message: null });
}

async function findSnapshot({ publication, contentHash, hasLocalContent, findSnapshotCandidates, resolveSnapshotCandidate, storeSnapshotContent }) {
    if (await hasLocalContent(new ContentReference({ hash: contentHash }))) return { ok: true };
    const candidates = [];
    const own = publication.contentReference;
    if (own?.uri && own?.storage && own.storage !== 'local') candidates.push({ contentHash, locator: own.uri, storage: own.storage });
    let searchFailed = false;
    if (typeof findSnapshotCandidates === 'function') {
        try {
            const result = await findSnapshotCandidates();
            if (result?.outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE) searchFailed = true;
            for (const candidate of result?.candidates ?? []) {
                if (candidate?.contentHash === contentHash && !candidates.some((c) => c.locator === candidate.locator)) candidates.push(candidate);
            }
        } catch {
            searchFailed = true;
        }
    }
    candidates.sort((a, b) => rank(a.storage) - rank(b.storage));
    const reasons = [];
    for (const candidate of typeof resolveSnapshotCandidate === 'function' ? candidates : []) {
        let resolution;
        try {
            resolution = await resolveSnapshotCandidate(candidate);
        } catch (error) {
            reasons.push(error.message);
            continue;
        }
        if (resolution?.outcome !== DecentralizedSnapshotResolutionOutcome.RESOLVED) {
            if (resolution?.reason) reasons.push(resolution.reason);
            continue;
        }
        const stored = await storeSnapshotContent({ contentHash, bytes: resolution.bytes });
        if (stored.outcome === StoreSnapshotContentOutcome.STORED || stored.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE) return { ok: true };
        reasons.push('the build found does not match the Publication');
    }
    const title = `"${publication.title}" by ${publication.author ?? 'an unknown author'} is signed and checks out, but`;
    if (candidates.length === 0) {
        return { ok: false, message: searchFailed
            ? `${title} its build couldn't be looked for right now. Try again later.`
            : `${title} its build has not been found on Steem, Nostr or Arweave.` };
    }
    return { ok: false, message: `${title} its build couldn't be loaded: ${reasons.join('; ') || 'no store could read it'}.` };
}

function rank(storage) {
    const index = CANDIDATE_STORAGE_ORDER.indexOf(storage);
    return index === -1 ? CANDIDATE_STORAGE_ORDER.length : index;
}

function failure(outcome, message, publication = null) {
    return Object.freeze({ outcome, publication, documentId: null, message });
}
