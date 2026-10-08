import { inspectWorldEncounterMaterial } from '../worldEncounter/WorldEncounterMaterialInspection.js';
import { WorldEncounterKind } from '../../core/WorldEncounter.js';
import { Publication } from '../../publisher/Publication.js';

// Finds Publications other players distributed on the decentralized
// substrates (Nostr, Arweave, Steem) and admits them to the Repository, so a
// World distributed to be found is found without a peer connection or a
// shared link (docs/Architecture.md, "Repository network discovery").
//
// An announcement is only a claim: its objectId picks which record to fetch,
// nothing more. A record is admitted only when the composed World Encounter
// verifier returns VERIFIED (validly signed for the key it names) and it is
// exactly the Publication the announcement named, the same bar
// VerifyClaimedBuildPublication.js holds. Anyone can post under the shared
// tag, so every run is bounded and a record that failed is not fetched again
// while this instance lives.

export const DEFAULT_MAX_INSPECTIONS_PER_RUN = 20;

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

export class RepositoryNetworkDiscovery {
    // `services`: announcement queries exposing searchEnvelopes(tag), nulls
    // skipped. `isKnown(publicationId)`: true for a Publication this device
    // already lists, which is never fetched again. `admit(publication,
    // { locator })`: the Repository's sinks; `locator` is where the signed
    // record was read, which a link view can open again to fetch its build.
    constructor({
        services = [],
        discoveryTag,
        materialSources,
        verifier,
        isKnown = () => false,
        admit,
        maxInspectionsPerRun = DEFAULT_MAX_INSPECTIONS_PER_RUN
    } = {}) {
        if (!isNonEmptyString(discoveryTag)) {
            throw new Error('RepositoryNetworkDiscovery: a discoveryTag is required');
        }
        if (typeof admit !== 'function') {
            throw new Error('RepositoryNetworkDiscovery: an admit function is required');
        }
        this._services = services.filter((service) => service && typeof service.searchEnvelopes === 'function');
        this._discoveryTag = discoveryTag;
        this._materialSources = materialSources;
        this._verifier = verifier;
        this._isKnown = isKnown;
        this._admit = admit;
        this._maxInspectionsPerRun = maxInspectionsPerRun;
        // uri -> true once its record was fetched and refused. An unavailable
        // record is not remembered: a gateway may serve it next time.
        this._refusedUris = new Set();
        this._running = null;
    }

    // Resolves to { admitted: Publication[], known: string[], pending },
    // `known` the ids announced under the tag that this device already lists
    // (never fetched), `pending` counting the new leads left for a later run
    // by the per-run cap. Never throws. A call while a run is in progress
    // shares that run.
    run() {
        if (!this._running) {
            this._running = this._run().finally(() => {
                this._running = null;
            });
        }
        return this._running;
    }

    async _run() {
        const leads = await this._collectLeads();
        const admitted = [];
        const known = new Set();
        let inspected = 0;
        let pending = 0;
        for (const lead of leads) {
            if (admitted.some((publication) => publication.id === lead.objectId)) {
                continue;
            }
            if (known.has(lead.objectId) || this._isKnownQuietly(lead.objectId)) {
                known.add(lead.objectId);
                continue;
            }
            if (inspected >= this._maxInspectionsPerRun) {
                pending += 1;
                continue;
            }
            inspected += 1;
            const publication = await this._verifiedPublicationOf(lead);
            if (!publication) {
                continue;
            }
            try {
                this._admit(publication, Object.freeze({ locator: lead.uri }));
                admitted.push(publication);
            } catch {
                // A failed sink never stops the rest of the run.
            }
        }
        return Object.freeze({ admitted: Object.freeze(admitted), known: Object.freeze([...known]), pending });
    }

    // Every Publication announcement under the shared tag, one lead per uri,
    // in the order the services report them (newest first on each).
    async _collectLeads() {
        const settled = await Promise.allSettled(this._services.map((service) => service.searchEnvelopes(this._discoveryTag)));
        const leads = new Map();
        for (const result of settled) {
            if (result.status !== 'fulfilled' || !Array.isArray(result.value)) {
                continue;
            }
            for (const envelope of result.value) {
                if (!envelope || envelope.kind !== WorldEncounterKind.PUBLICATION
                    || !isNonEmptyString(envelope.objectId) || !isNonEmptyString(envelope.uri)
                    || leads.has(envelope.uri) || this._refusedUris.has(envelope.uri)) {
                    continue;
                }
                leads.set(envelope.uri, Object.freeze({
                    objectId: envelope.objectId,
                    origin: envelope.origin || null,
                    uri: envelope.uri
                }));
            }
        }
        return [...leads.values()];
    }

    _isKnownQuietly(publicationId) {
        try {
            return Boolean(this._isKnown(publicationId));
        } catch {
            return false;
        }
    }

    async _verifiedPublicationOf(lead) {
        let inspection;
        try {
            inspection = await inspectWorldEncounterMaterial({
                resolvedSelection: Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId: lead.objectId, origin: lead.origin }),
                resolvedLead: Object.freeze({ origin: lead.origin, discoveryTag: this._discoveryTag, uri: lead.uri }),
                materialSources: this._materialSources,
                verifier: this._verifier
            });
        } catch {
            return null;
        }
        if (!inspection || inspection.loading.status !== 'AVAILABLE') {
            return null;
        }
        if (inspection.verification.status !== 'VERIFIED') {
            this._refusedUris.add(lead.uri);
            return null;
        }
        let publication;
        try {
            publication = inspection.loading.material instanceof Publication
                ? inspection.loading.material
                : Publication.fromJSON(inspection.loading.material);
        } catch {
            this._refusedUris.add(lead.uri);
            return null;
        }
        if (!publication || publication.id !== lead.objectId) {
            this._refusedUris.add(lead.uri);
            return null;
        }
        return publication;
    }
}
