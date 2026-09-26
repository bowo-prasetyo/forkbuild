import { Publication } from '../../publisher/Publication.js';
import { ContentReference } from '../../core/ContentReference.js';
import { WorldEncounterKind } from '../../core/WorldEncounter.js';
import { steemContentLocator } from '../../core/SteemContentManifest.js';
import { verifyWorldEncounterMaterial, WorldEncounterMaterialVerificationStatus } from '../worldEncounter/WorldEncounterMaterialVerification.js';
import { SnapshotCandidateDiscoveryOutcome } from '../snapshot/SnapshotCandidateDiscoveryOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { StoreSnapshotContentOutcome } from '../snapshot/materialization/StoreSnapshotContentOutcome.js';

// Opening a Publication from a link on a Steem post
// (`#/view/steem/<author>/<permlink>`, written into the notice of a Signed
// Claim stored on Steem; docs/Protocol.md, "Proposed: Steem Content
// Storage"). World View shows only Publications whose signature checks out,
// so the link names the Signed Claim, and the build is found from it:
//
//   1. read the claim from Steem (SteemWorldEncounterMaterialResolver);
//   2. verify it with the same verifier World discovery uses;
//   3. find its Snapshot: already on this device, at the claim's own
//      locator, or among announced Snapshot candidates (Nostr, Arweave,
//      Steem) with the claim's content hash;
//   4. check and keep the Snapshot locally (StoreSnapshotContentUseCase);
//   5. admit the Publication as World discovery does (the discovery
//      provider and the durable admission log).
//
// World View then loads the Publication like any other. Nothing here trusts
// Steem: the signature and the content hash decide.

export const OpenSteemPublicationLinkOutcome = Object.freeze({
    OPENED: 'opened',
    INVALID_LINK: 'invalid-link',
    CLAIM_UNAVAILABLE: 'claim-unavailable',
    STEEM_UNREACHABLE: 'steem-unreachable',
    NOT_A_PUBLICATION: 'not-a-publication',
    NOT_VERIFIED: 'not-verified',
    BUILD_NOT_FOUND: 'build-not-found'
});

const Outcome = OpenSteemPublicationLinkOutcome;
const CANDIDATE_STORAGE_ORDER = ['steem', 'ar', 'ipfs'];

export async function openSteemPublicationLink({
    author, permlink,
    retrieveClaim, verifier,
    hasLocalContent = async () => false,
    findSnapshotCandidates = null, resolveSnapshotCandidate = null,
    storeSnapshotContent,
    discoveryProvider = null, admissionLog = null
}) {
    let locator;
    try {
        locator = steemContentLocator(author, permlink);
    } catch {
        return failure(Outcome.INVALID_LINK, 'This link does not name a Steem post.');
    }

    let material;
    try {
        material = await retrieveClaim(locator);
    } catch (error) {
        return failure(Outcome.STEEM_UNREACHABLE, `Steem could not be reached to read @${author}/${permlink}: ${error.message}`);
    }
    if (material === null || material === undefined) {
        return failure(Outcome.CLAIM_UNAVAILABLE, `@${author}/${permlink} is not a Publication stored on Steem by ForkBuild, or it can't be read.`);
    }

    let publication = null;
    try {
        publication = material instanceof Publication ? material : Publication.fromJSON(material);
    } catch {
        // Reported just below.
    }
    if (!publication || !publication.id || !publication.documentId || !publication.contentHash) {
        return failure(Outcome.NOT_A_PUBLICATION, `@${author}/${permlink} does not hold a ForkBuild Publication.`);
    }

    const verification = await verifyWorldEncounterMaterial({
        resolvedSelection: Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, origin: `dweb:steem:${author}` }),
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
