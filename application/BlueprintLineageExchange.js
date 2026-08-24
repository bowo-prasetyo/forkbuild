import { BlueprintLineageClaim } from '../core/BlueprintLineageClaim.js';
import { blueprintFingerprintsEqual } from '../core/BlueprintFingerprint.js';
import { validateBlueprintLineageClaimPublication } from './BlueprintLineageClaimPublicationValidator.js';

// 0.6.8 — Blueprint Lineage & Revision Discovery.
//
// The application/BlueprintAttributionExchange.js shape, one concept
// over: a lineage claim never establishes that a derivation actually
// happened, it only ever moves an already-signed assertion from one
// replica's store into another's, unchanged, still independently
// verifiable at the far end.
//
//   Alice's claim --export--> publication --import--> Bob's claim store
//
// The one rule this class adds beyond a straight passthrough: a claim
// carries TWO fingerprints, and a receiver that actually has ONE of the
// two designs locally (typically because it just imported the matching
// Blueprint Package alongside it) can, and should, recompute THAT
// fingerprint locally rather than trusting the string the claim merely
// carries — the exact same "genuine signature, wrong subject" defense
// application/BlueprintAttributionExchange.js already built for a
// single fingerprint, applied here independently to each side of the
// claim. Both `expectedSourceFingerprint` and `expectedDerivedFingerprint`
// are OPTIONAL and independent: a caller with only the derived design on
// hand checks only that one, a caller with both checks both, and a bare
// claim import with neither supplied is still importable, still
// verified, still stored — simply an unconfirmed assertion about two
// fingerprints, exactly as informational as any other unconfirmed
// fingerprint 0.6.5 already established that posture for.
export class BlueprintLineageExchange {
    constructor(store, verifier) {
        if (!store) {
            throw new Error('BlueprintLineageExchange: a BlueprintLineageClaim store is required');
        }
        if (!verifier) {
            throw new Error('BlueprintLineageExchange: an authorization verifier is required');
        }
        this._store = store;
        this._verifier = verifier;
    }

    // The portable publication for a claim this replica already has —
    // pure passthrough to `claim.toJSON()`. Throws for anything that
    // isn't a signed BlueprintLineageClaim instance.
    exportClaim(claim) {
        if (!claim || !(claim instanceof BlueprintLineageClaim)) {
            throw new Error('BlueprintLineageExchange: a BlueprintLineageClaim instance is required');
        }
        if (!claim.signature) {
            throw new Error('BlueprintLineageExchange: refusing to publish an unsigned lineage claim');
        }
        return claim.toJSON();
    }

    // validate -> construct -> verify -> cross-check(source) ->
    // cross-check(derived) -> dedupe-by-id -> store, always in that
    // order. Only after every step succeeds does anything get persisted.
    // Deduplicates by the claim's own `id`, checked against the
    // derivedFingerprint's own index — sufficient because
    // application/LocalBlueprintLineageClaimStore.js#save() always
    // writes the same claim under both of its own fingerprints in
    // lockstep, so presence under one implies presence under the other.
    // Returns `{ claim, isNew }` — `isNew` is false for a claim this
    // replica already knew about, never an error.
    importClaim(pkg, { expectedSourceFingerprint = null, expectedDerivedFingerprint = null } = {}) {
        validateBlueprintLineageClaimPublication(pkg);

        const claim = BlueprintLineageClaim.fromJSON(pkg);
        const result = this._verifier.verifyBlueprintLineageClaim(claim.toJSON());
        if (!result.valid) {
            throw new Error(`BlueprintLineageExchange: refusing to import an unverifiable lineage claim — ${result.reason}`);
        }

        if (expectedSourceFingerprint && !blueprintFingerprintsEqual(expectedSourceFingerprint, claim.sourceFingerprint)) {
            throw new Error('BlueprintLineageExchange: refusing to import a claim whose source design does not match the one on file — its fingerprint does not match, even though its signature verified');
        }
        if (expectedDerivedFingerprint && !blueprintFingerprintsEqual(expectedDerivedFingerprint, claim.derivedFingerprint)) {
            throw new Error('BlueprintLineageExchange: refusing to import a claim whose derived design does not match the one on file — its fingerprint does not match, even though its signature verified');
        }

        if (this._store.has(claim.derivedFingerprint, claim.id)) {
            const existing = this._store.list(claim.derivedFingerprint).find((known) => known.id === claim.id);
            return { claim: existing || claim, isNew: false };
        }

        this._store.save(claim);
        return { claim, isNew: true };
    }
}
