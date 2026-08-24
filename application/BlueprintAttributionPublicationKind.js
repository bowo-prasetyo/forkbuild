import { BlueprintAttribution, BLUEPRINT_ATTRIBUTION_KIND } from '../core/BlueprintAttribution.js';
import { blueprintFingerprintsEqual } from '../core/BlueprintFingerprint.js';
import { validateBlueprintAttributionPublication } from './BlueprintAttributionPublicationValidator.js';

// 0.7.0 — Decentralized Publication Protocol & Content Addressing.
//
// The first concrete `kindPlugin` for application/PublicationResolver.js
// — proof that the generic ten-step pipeline that class's own header
// describes needs nothing new from a domain to work with it: every
// function this plugin hands over already existed before this milestone
// (core/BlueprintAttribution.js#fromJSON, application/
// BlueprintAttributionPublicationValidator.js, identity/
// LocalAuthorizationVerifier.js#verifyBlueprintAttribution). 0.7.1 adds
// application/PlaceNamingClaimPublicationKind.js as a second, deliberately
// differently-shaped plugin — see that file's own header for what its
// existence actually proves.
//
// This is a SECOND transport for a BlueprintAttribution, never a
// replacement for application/BlueprintAttributionExchange.js's own
// peer-gossip/pasted-file path built in 0.6.6 — the exact same
// attribution can travel either way, and a receiver ends up with the
// identical, independently-verifiable core/BlueprintAttribution.js
// either way. What a PublicationResolver adds is a locator an
// attribution can be FOUND at without a peer connection or a hand-off
// file at all — a content/LocalContentStore.js, or, as of 0.7.1, a real
// content/IpfsContentStore.js, with no change required here either way.
//
// `expectedFingerprint` carries forward the exact "genuine signature,
// wrong subject" defense application/BlueprintAttributionExchange.js's
// own header already established: OPTIONAL, and checked only in
// crossCheck() — after both the envelope's AND the attribution's own
// signatures have already verified — never before.
export function createBlueprintAttributionPublicationKind({ verifier, store, expectedFingerprint = null }) {
    if (!verifier) {
        throw new Error('createBlueprintAttributionPublicationKind: an authorization verifier is required');
    }
    if (!store) {
        throw new Error('createBlueprintAttributionPublicationKind: a BlueprintAttribution store is required');
    }

    return {
        contentKind: BLUEPRINT_ATTRIBUTION_KIND,

        validate: validateBlueprintAttributionPublication,

        fromJSON: (json) => BlueprintAttribution.fromJSON(json),

        verify: (json) => verifier.verifyBlueprintAttribution(json),

        crossCheck: (attribution) => {
            if (expectedFingerprint && !blueprintFingerprintsEqual(expectedFingerprint, attribution.fingerprint)) {
                throw new Error('createBlueprintAttributionPublicationKind: refusing to resolve an attribution for a different design than the one on file — its fingerprint does not match, even though its signature verified');
            }
        },

        // Dedup-by-id, the exact same posture
        // application/BlueprintAttributionExchange.js#importAttribution()
        // already established — a resolved publication this replica
        // already knows about is never an error, only the ordinary cost
        // of the same attribution reaching this replica through more
        // than one transport.
        store: (attribution) => {
            if (store.has(attribution.fingerprint, attribution.id)) {
                const existing = store.list(attribution.fingerprint)
                    .find((known) => known.id === attribution.id);
                return { attribution: existing || attribution, isNew: false };
            }
            store.save(attribution);
            return { attribution, isNew: true };
        }
    };
}
