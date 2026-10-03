import { Publication } from '../../publisher/Publication.js';
import { ContentReference } from '../../core/ContentReference.js';
import { WorldEncounterKind } from '../../core/WorldEncounter.js';
import { describePublicationClaimLocator } from '../../core/ForkBuildAppLinks.js';
import { verifyWorldEncounterMaterial, WorldEncounterMaterialVerificationStatus } from '../worldEncounter/WorldEncounterMaterialVerification.js';
import { SnapshotCandidateDiscoveryOutcome } from '../snapshot/SnapshotCandidateDiscoveryOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from '../snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { StoreSnapshotContentOutcome } from '../snapshot/materialization/StoreSnapshotContentOutcome.js';
import { PublisherPlacementAdoption } from '../placement/AdoptPublisherPlacementUseCase.js';
import { message } from '../../core/Message.js';
import { isUserFacingError } from '../../core/UserFacingError.js';

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
//      provider and the durable admission log);
//   6. adopt its publisher's signed placement, announced beside the
//      Snapshot (`publisherPlacement`), so the build stands where its
//      publisher put it. Searched for even when the build is already here,
//      until this device holds one.
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
// Every result's `message` is a descriptor (core/Message.js), with a message
// per network where what to say differs (publicationLink.<outcome>.<network>).
// `detail` is the network's own error text, which is not translated.
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
    discoveryProvider = null, admissionLog = null,
    publisherPlacement = null
}) {
    const where = describePublicationClaimLocator(locator);
    if (!where) return failure(Outcome.INVALID_LINK, message('publicationLink.invalid'));

    let material;
    try {
        material = await retrieveClaim(where.locator);
    } catch (error) {
        return failure(Outcome.UNREACHABLE, message(`publicationLink.unreachable.${where.network}`, {
            label: where.label,
            detail: isUserFacingError(error) ? error.userMessage : String(error.message).replace(/\.$/, '')
        }));
    }
    if (material === null || material === undefined) {
        return failure(Outcome.CLAIM_UNAVAILABLE, message(`publicationLink.claimUnavailable.${where.network}`, { label: where.label }));
    }

    let publication = null;
    try {
        publication = material instanceof Publication ? material : Publication.fromJSON(material);
    } catch {
        // Reported just below.
    }
    if (!publication || !publication.id || !publication.documentId || !publication.contentHash) {
        return failure(Outcome.NOT_A_PUBLICATION, message('publicationLink.notAPublication', { label: where.label }));
    }

    const verification = await verifyWorldEncounterMaterial({
        resolvedSelection: Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id, origin: `dweb:${where.network}:${where.locator}` }),
        material: publication,
        verifier
    });
    if (verification.status !== WorldEncounterMaterialVerificationStatus.VERIFIED) {
        return failure(Outcome.NOT_VERIFIED, message(verification.status === WorldEncounterMaterialVerificationStatus.REJECTED
            ? 'publicationLink.signatureRejected'
            : 'publicationLink.unsigned', { title: publication.title }), publication);
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
    const placementAdopted = await adoptPublisherPlacement({ publication, contentHash, candidates: found.candidates, findSnapshotCandidates, publisherPlacement });
    return Object.freeze({ outcome: Outcome.OPENED, publication, documentId: publication.documentId, placementAdopted, message: null });
}

// Adopts every signed placement announced for this Publication's build (the
// adoption itself keeps only the publisher's, newest revision). Never stops
// the link from opening: without one, the build stands at a stand-in position.
async function adoptPublisherPlacement({ publication, contentHash, candidates, findSnapshotCandidates, publisherPlacement }) {
    if (!publisherPlacement) return false;
    try {
        if (publisherPlacement.has(publication)) return false;
        let announced = candidates;
        if (!announced && typeof findSnapshotCandidates === 'function') {
            announced = (await findSnapshotCandidates())?.candidates ?? [];
        }
        let adopted = false;
        for (const candidate of announced ?? []) {
            const record = candidate?.placementRecord;
            if (candidate?.contentHash !== contentHash || !record || record.publicationId !== publication.id) continue;
            const adoption = await publisherPlacement.adopt(record);
            if (adoption?.outcome === PublisherPlacementAdoption.ADOPTED) adopted = true;
        }
        return adopted;
    } catch {
        return false;
    }
}

// `candidates` is what the announcement search found, or null when the build
// was already here and nothing was searched.
async function findSnapshot({ publication, contentHash, hasLocalContent, findSnapshotCandidates, resolveSnapshotCandidate, storeSnapshotContent }) {
    if (await hasLocalContent(new ContentReference({ hash: contentHash }))) return { ok: true, candidates: null };
    const candidates = [];
    const own = publication.contentReference;
    if (own?.uri && own?.storage && own.storage !== 'local') candidates.push({ contentHash, locator: own.uri, storage: own.storage });
    let searchFailed = false;
    let announced = null;
    if (typeof findSnapshotCandidates === 'function') {
        try {
            const result = await findSnapshotCandidates();
            if (result?.outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE) searchFailed = true;
            announced = result?.candidates ?? [];
            for (const candidate of announced) {
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
        if (stored.outcome === StoreSnapshotContentOutcome.STORED || stored.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE) return { ok: true, candidates: announced };
        reasons.push(message('publicationLink.buildMismatch'));
    }
    const params = {
        title: publication.title,
        author: publication.author ?? message('publicationLink.unknownAuthor')
    };
    if (candidates.length === 0) {
        return { ok: false, message: message(searchFailed ? 'publicationLink.buildSearchFailed' : 'publicationLink.buildNotFound', params) };
    }
    return {
        ok: false,
        message: message('publicationLink.buildNotLoaded', { ...params, reasons: reasons.length ? reasons : [message('publicationLink.noStoreCouldRead')] })
    };
}

function rank(storage) {
    const index = CANDIDATE_STORAGE_ORDER.indexOf(storage);
    return index === -1 ? CANDIDATE_STORAGE_ORDER.length : index;
}

function failure(outcome, message, publication = null) {
    return Object.freeze({ outcome, publication, documentId: null, message });
}
