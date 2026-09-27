import { inspectWorldEncounterMaterial } from '../../worldEncounter/WorldEncounterMaterialInspection.js';
import { WorldEncounterKind } from '../../../core/WorldEncounter.js';
import { publicationRecordTag } from '../../../core/NarrowDiscoveryTags.js';
import { Publication } from '../../../publisher/Publication.js';

// Verifies a claimed build's Publication straight from the network, so a
// Wanderer can accept a stranger's claimed position without having been
// shared the Publication or met its publisher as a peer (see ClaimedBuilds.js).
//
// Discover Publication (DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js)
// cannot do this: it links a network lead to a Publication only through a
// location claim inside a Publication record this device already holds, so
// it only ever resolves the Wanderer's own. Here the claimed build supplies
// what is missing: the publicationId and content hash from its Snapshot
// announcement.
//
// An announcement's `objectId` is only a claim, so it is used solely to pick
// which records to fetch. Nothing is trusted until a fetched record passes
// every check:
// - the composed World Encounter verifier returns VERIFIED: its identity is
//   exactly `publicationId` and its signature is valid for the key it names
//   (an unsigned record is only UNVERIFIABLE and never passes);
// - it names exactly `contentHash`, the content the ghost shows, so accepting
//   can never place something other than what the Wanderer saw.
// Only then is it admitted, through the same `admit` sinks World Encounters
// use (the Repository's discovery provider and its durable log).
//
// What this proves: the build is the content of a Publication signed by the
// key in its record. Not who holds that key, and not the claimed position:
// Accept Position stays the Wanderer's own decision.

export const ClaimedBuildVerificationOutcome = Object.freeze({
    VERIFIED: 'verified',
    // No announcement for this Publication was found.
    NOT_FOUND: 'not-found',
    // Records were found, but none was signed, valid, and for this Publication.
    UNVERIFIED: 'unverified',
    // A valid, signed record was found, but it names other content.
    CONTENT_MISMATCH: 'content-mismatch'
});

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// `services`: announcement query services exposing searchEnvelopes(tag)
// (NostrPublicationRelaySetDiscoveryQueryService, ArweaveGraphqlDiscoveryQueryService),
// nulls skipped. `globalDiscoveryTag`: the shared Publication tag, read too so
// records announced before the per-Publication record tag existed are found.
export async function verifyClaimedBuildPublication({
    publicationId,
    contentHash,
    services = [],
    globalDiscoveryTag = null,
    materialSources,
    verifier,
    admit = () => {}
} = {}) {
    if (!isNonEmptyString(publicationId) || !isNonEmptyString(contentHash)) {
        return Object.freeze({ outcome: ClaimedBuildVerificationOutcome.NOT_FOUND, publication: null });
    }

    const tags = [publicationRecordTag(publicationId), globalDiscoveryTag].filter(isNonEmptyString);
    const leads = new Map();
    for (const service of services) {
        if (!service || typeof service.searchEnvelopes !== 'function') {
            continue;
        }
        for (const tag of tags) {
            let envelopes;
            try {
                envelopes = await service.searchEnvelopes(tag);
            } catch {
                continue;
            }
            for (const envelope of Array.isArray(envelopes) ? envelopes : []) {
                if (!envelope || envelope.kind !== WorldEncounterKind.PUBLICATION
                    || envelope.objectId !== publicationId || !isNonEmptyString(envelope.uri)) {
                    continue;
                }
                if (!leads.has(envelope.uri)) {
                    leads.set(envelope.uri, { origin: envelope.origin || null, discoveryTag: tag, uri: envelope.uri });
                }
            }
        }
    }

    if (leads.size === 0) {
        return Object.freeze({ outcome: ClaimedBuildVerificationOutcome.NOT_FOUND, publication: null });
    }

    let sawValidOtherContent = false;
    for (const lead of leads.values()) {
        let inspection;
        try {
            inspection = await inspectWorldEncounterMaterial({
                resolvedSelection: Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationId, origin: lead.origin }),
                resolvedLead: Object.freeze(lead),
                materialSources,
                verifier
            });
        } catch {
            continue;
        }
        if (!inspection || inspection.loading.status !== 'AVAILABLE' || inspection.verification.status !== 'VERIFIED') {
            continue;
        }
        let publication;
        try {
            publication = inspection.loading.material instanceof Publication
                ? inspection.loading.material
                : Publication.fromJSON(inspection.loading.material);
        } catch {
            continue;
        }
        if (!publication || publication.id !== publicationId) {
            continue;
        }
        const hash = publication.contentReference ? publication.contentReference.hash : null;
        if (hash !== contentHash) {
            sawValidOtherContent = true;
            continue;
        }
        try {
            admit(publication);
        } catch {
            // Admission is the caller's sink; its failure is reported by the
            // caller's own lookup finding nothing, never as a false verification.
        }
        return Object.freeze({ outcome: ClaimedBuildVerificationOutcome.VERIFIED, publication });
    }

    return Object.freeze({
        outcome: sawValidOtherContent ? ClaimedBuildVerificationOutcome.CONTENT_MISMATCH : ClaimedBuildVerificationOutcome.UNVERIFIED,
        publication: null
    });
}
