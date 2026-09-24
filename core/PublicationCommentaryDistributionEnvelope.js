import { PublicationCommentary } from './PublicationCommentary.js';
import { Signature, SignatureType } from './Signature.js';

// 0.9.618 — Publication Commentary Distribution Envelope.
//
// 0.9.617's own audit measured the gap precisely: Commentary
// (core/PublicationCommentary.js, 0.9.242) is a real, durable,
// storage-backed application fact whose one existing identity
// (publicationId) already targets the correct cross-device dimension —
// but it cannot leave the device it was created on, by any path, today.
// Neither existing envelope fits it without being repurposed:
// core/DecentralizedDiscoveryEnvelope.js answers "which OBJECT does this
// uri claim to be for" (a locator pointing at content elsewhere);
// core/SnapshotDiscoveryEnvelope.js is keyed by contentHash/locator/
// storage (also a locator). Commentary is neither — it IS the content,
// small enough to travel whole. This file is the sibling envelope the
// audit recommended: never a repurposing of either existing shape, never
// a locator, a small signed copy of a Commentary's own fields plus a
// signature over them.
//
//   PublicationCommentary                    (0.9.242, unmodified — the
//        │                                    local, unsigned domain fact)
//        │  wrapped, never mutated or
//        │  subclassed
//        ▼
//   PublicationCommentaryDistributionEnvelope   (THIS FILE)
//        │  commentary.toJSON() fields + signature
//        ▼
//   application/publication/commentary/PublicationCommentaryDistributionExchange.js
//        (sign on export / verify + reconstruct on import)
//        ▼
//   application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js
//        (announce over the existing peer transport —
//         peer/PeerMessageBus.js + application/peer/ConnectedPeerRegistry.js,
//         never a new one)
//        ▼
//   storage/PublicationCommentaryStore.js   (0.9.243, unmodified — the
//                                             SAME store a locally
//                                             authored commentary already
//                                             uses; its own commentaryId
//                                             idempotent/conflict
//                                             semantics are reused
//                                             directly, never reinvented)
//
// A THIN WRAPPER AROUND A REAL PublicationCommentary INSTANCE, NEVER A
// PARALLEL, HAND-ROLLED COPY OF ITS FIELDS OR ITS VALIDATION. This class
// holds exactly one `PublicationCommentary` (constructed through that
// class's own constructor, so every validation rule it already enforces
// — non-empty content, a real commentaryId/publicationId/
// authorIdentityId — applies here too, unduplicated) plus an optional
// `Signature`. `core/PublicationCommentary.js` itself is NEVER modified
// by this milestone — it still carries no signature field, no
// getSigningDescriptor() method, exactly as 0.9.617's own audit measured
// (Section A, assertions 2-3) — because the signature answers a
// completely different question ("who signed this envelope for
// distribution") than the commentary fact answers ("what was said, by
// whom, about what"). See "A narrow, structural claim," below, for why
// the two must stay independent even here.
//
// A NARROW, STRUCTURAL CLAIM, NEVER PUBLICATION OWNERSHIP. A valid
// signature on this envelope establishes exactly one thing: "the
// identity named by this envelope's own authorIdentityId really did sign
// exactly this commentaryId/publicationId/content/createdAt tuple." It
// establishes nothing about whether that identity authored, publishes,
// or has any standing relationship to the Publication being commented
// on — Publication authorship (publisher/Publication.js#publisherIdentity)
// and Commentary authorship remain two independent identity claims, the
// same separation 0.9.617's own Section F already proved holds
// structurally for the unsigned domain object (core/
// PublicationCommentary.js never reads publisherIdentity at all). See
// identity/LocalAuthorizationVerifier.js#
// verifyPublicationCommentaryDistributionEnvelope(), which checks the
// signer against this envelope's own `authorIdentityId` ONLY, never
// against any Publication's own publisherIdentity.
//
// A REQUIRED SIGNATURE, NEVER TOLERATED UNSIGNED — the same discipline
// core/PlaceNamingClaim.js and core/BlueprintAttribution.js already hold
// for a claim with exactly one party to it: an envelope carrying no
// signature, or a signer that does not equal its own `authorIdentityId`,
// is refused outright by the verifier, never accepted as "legacy" or
// "unsigned but tolerated." A remotely-received Commentary is worthless
// as a cross-device fact unless it is provably the named author's own
// assertion — see identity/LocalAuthorizationVerifier.js's own header,
// "no unsigned claims," for the family this joins.
//
// `toCommentary()` HANDS BACK THE EXACT SAME `PublicationCommentary`
// INSTANCE THIS ENVELOPE ALREADY HOLDS — never a re-derived or
// re-validated copy. A caller (application/
// PublicationCommentaryDistributionExchange.js#importCommentaryEnvelope())
// verifies the envelope's signature FIRST, then calls `toCommentary()`
// and hands the result straight to the EXISTING, UNMODIFIED
// storage/PublicationCommentaryStore.js#save() — the exact reuse
// 0.9.617's own Section G/I proved already gives idempotent-arrival and
// conflict-refusal semantics for free. This file introduces no second
// Commentary database, no cache, and no parallel persistence index of
// any kind.
//
// SYNCHRONOUS, NO NETWORK, NO STORAGE OF ITS OWN. Exactly like every
// other envelope in this family (core/DecentralizedDiscoveryEnvelope.js,
// core/SnapshotDiscoveryEnvelope.js, core/DecentralizedPublication.js),
// this file performs no I/O — it only describes a wire shape and a
// signing descriptor for one already-in-hand commentary.
export const PUBLICATION_COMMENTARY_DISTRIBUTION_KIND = 'forkbuild.publication-commentary-distribution';
export const CURRENT_SCHEMA_VERSION = 1;

export class PublicationCommentaryDistributionEnvelope {
    constructor({ commentary, signature = null } = {}) {
        const resolved = commentary instanceof PublicationCommentary
            ? commentary
            : PublicationCommentary.fromJSON(commentary);
        if (!resolved) {
            throw new Error('PublicationCommentaryDistributionEnvelope requires a valid PublicationCommentary payload');
        }
        this._commentary = resolved;
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get commentary() { return this._commentary; }
    get commentaryId() { return this._commentary.commentaryId; }
    get publicationId() { return this._commentary.publicationId; }
    get authorIdentityId() { return this._commentary.authorIdentityId; }
    get content() { return this._commentary.content; }
    get createdAt() { return this._commentary.createdAt; }
    get signature() { return this._signature; }

    // Never mutates this instance — the same "signing produces a new
    // object" discipline every signed envelope in this codebase already
    // follows (see core/DecentralizedPublication.js#withSignature()).
    withSignature(signature) {
        return new PublicationCommentaryDistributionEnvelope({ commentary: this._commentary, signature });
    }

    // Canonical signing descriptor, delegating to the standalone
    // getPublicationCommentaryDistributionSigningDescriptor() below so
    // identity/LocalAuthorizationVerifier.js can reconstruct the
    // identical descriptor from a plain JSON record that was never
    // rehydrated into an instance — the same split every other signed
    // envelope in this codebase keeps (see core/BlueprintAttribution.js).
    getSigningDescriptor() {
        return getPublicationCommentaryDistributionSigningDescriptor(this.toJSON());
    }

    // The wire shape: this envelope's own kind/schemaVersion, the
    // wrapped commentary's own five fields (verbatim — never renamed,
    // never re-derived), and the signature, if any.
    toJSON() {
        return {
            kind: PUBLICATION_COMMENTARY_DISTRIBUTION_KIND,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            ...this._commentary.toJSON(),
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    // Hands back the exact PublicationCommentary instance this envelope
    // already validated at construction — see this file's own header.
    toCommentary() {
        return this._commentary;
    }

    // Builds an UNSIGNED envelope from a real, already-in-hand
    // PublicationCommentary instance — the starting point for
    // application/publication/commentary/PublicationCommentaryDistributionExchange.js#
    // exportCommentary(), which signs it next.
    static fromCommentary(commentary) {
        return new PublicationCommentaryDistributionEnvelope({ commentary });
    }

    // Never throws — a corrupted or unrecognized record simply isn't
    // restored, the same "validate strictly on write, degrade gracefully
    // on read" split core/PublicationCommentary.js#fromJSON() already
    // uses one layer down.
    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        try {
            return new PublicationCommentaryDistributionEnvelope({ commentary: json, signature: json.signature || null });
        } catch {
            return null;
        }
    }
}

// Standalone form of #getSigningDescriptor(), operating on a plain JSON
// `record` rather than a hydrated instance — the same split every other
// signed envelope in this codebase keeps between its class and its own
// get*SigningDescriptor() free function (see core/BlueprintAttribution.js's
// own getBlueprintAttributionSigningDescriptor()).
export function getPublicationCommentaryDistributionSigningDescriptor(record) {
    return {
        type: SignatureType.PUBLICATION_COMMENTARY_DISTRIBUTION,
        id: record.commentaryId,
        revision: record.createdAt,
        payload: {
            commentaryId: record.commentaryId,
            publicationId: record.publicationId,
            authorIdentityId: record.authorIdentityId,
            content: record.content,
            createdAt: record.createdAt
        }
    };
}
