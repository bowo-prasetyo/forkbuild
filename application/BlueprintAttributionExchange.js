import { BlueprintAttribution } from '../core/BlueprintAttribution.js';
import { blueprintFingerprintsEqual } from '../core/BlueprintFingerprint.js';
import { validateBlueprintAttributionPublication } from './BlueprintAttributionPublicationValidator.js';

// 0.6.6 — Decentralized Blueprint Exchange.
//
// 0.6.5 built the whole attribution MODEL — fingerprint, attribution,
// local store, summarize() — and drew its own boundary exactly where its
// own design conversation said to stop: "0.6.5 builds no exchange
// transport for an attribution at all... this is 0.6.6's own job." This
// class is that missing piece, the exact application/
// PlaceNamingClaimExchange.js shape, one domain over:
//
//   Alice's attribution --export--> publication --import--> Bob's attribution store
//
// The identical rule that class's own header states plainly, enforced
// structurally here instead of just by convention:
//
//   Attribution exchange DISTRIBUTES assertions; it never ESTABLISHES
//   who actually made a design.
//
// Every question of "who should I credit," "which of several attributions
// is right," or "how many known authors are there" stays exactly where
// 0.6.5 left it — application/BlueprintAttributionUseCase.js#summarize() —
// and this file never answers it, never ranks anything, and never decides
// which of two attributing identities is telling the truth. It only ever
// moves an attribution from one replica's store into another's, unchanged,
// still carrying its own signature, still independently verifiable at the
// far end.
//
// ---- The one rule this class adds beyond PlaceNamingClaimExchange -----
//
// A PlaceNamingClaim's `regionId` names a WorldRegion the importing
// replica may not even know about yet, so PlaceNamingClaimExchange has
// nothing local to cross-check a claim's `regionId` against. A
// BlueprintAttribution is different: the moment a receiver actually HAS
// the Structure an attribution claims to be about (typically because it
// just imported the matching Blueprint Package alongside it — see
// application/BlueprintPackage.js's own 0.6.6 `attributions` field), that
// receiver can — and MUST — recompute the fingerprint LOCALLY rather than
// simply trusting the string the package happened to carry:
//
//   Imported Structure --deriveBlueprintFingerprint--> actual fingerprint
//                                                             │
//   attribution.fingerprint (from the package) ---------------┤
//                                                             ▼
//                                                           equal?
//
// A cryptographically PERFECT signature proves only that the identity
// named by `authorIdentityId` really did sign THIS payload — it proves
// nothing about whether that payload's own `fingerprint` field describes
// the design actually sitting in front of the receiver. Attaching an
// authentic signature to a mismatched fingerprint is exactly the kind of
// "genuine signature, wrong subject" attack `expectedFingerprint` below
// exists to catch — checked only AFTER signature verification, because
// the fingerprint field itself is only trustworthy once the signature
// protecting it has already been confirmed.
//
// `expectedFingerprint` is OPTIONAL: a bare attribution received with no
// Structure to check it against (see this milestone's own design
// conversation — attribution can travel independently of the blueprint
// it's about) is still importable, still verified, still stored — it is
// simply an unconfirmed assertion about SOME design with that
// fingerprint, exactly as informational as any other attribution 0.6.5
// already treats "a fingerprint match" as being (see core/
// BlueprintAttribution.js's own header on why this layer establishes
// what a claim MEANS, never whether it is true).
export class BlueprintAttributionExchange {
    constructor(store, verifier, publicationLog) {
        if (!store) {
            throw new Error('BlueprintAttributionExchange: a BlueprintAttribution store is required');
        }
        if (!verifier) {
            throw new Error('BlueprintAttributionExchange: an authorization verifier is required');
        }
        if (!publicationLog) {
            throw new Error('BlueprintAttributionExchange: a publication log is required');
        }
        this._store = store;
        this._verifier = verifier;
        this._publicationLog = publicationLog;
    }

    // The portable publication for an attribution this replica already
    // has — pure passthrough to `attribution.toJSON()`, which already IS
    // the complete, self-describing wire form (see application/
    // BlueprintAttributionPublicationValidator.js's own header on why no
    // separate envelope module exists here, unlike
    // application/PlaceNamingClaimPublication.js one domain over). Throws
    // for anything that isn't a signed BlueprintAttribution instance — the
    // same "refuse to publish what a receiver could never verify" guard
    // application/PlaceNamingClaimPublication.js#buildPlaceNamingClaimPublication()
    // already applies one domain over.
    exportAttribution(attribution) {
        if (!attribution || !(attribution instanceof BlueprintAttribution)) {
            throw new Error('BlueprintAttributionExchange: a BlueprintAttribution instance is required');
        }
        if (!attribution.signature) {
            throw new Error('BlueprintAttributionExchange: refusing to publish an unsigned attribution');
        }
        return attribution.toJSON();
    }

    // The discipline every exchange class in this codebase follows,
    // always in this order, never fewer, with one new step this milestone
    // adds at the end:
    //
    //   1. validate  — application/BlueprintAttributionPublicationValidator.js
    //                   (is this even a well-formed publication?)
    //   2. construct — a real core/BlueprintAttribution.js from the
    //                   package's own fields (never trusted as-is)
    //   3. verify    — identity/LocalAuthorizationVerifier.js#
    //                   verifyBlueprintAttribution() (does it actually
    //                   carry a valid signature FROM its own claimed
    //                   author?)
    //   4. cross-check — does attribution.fingerprint actually match
    //                   `expectedFingerprint`, when the caller supplied
    //                   one? See this class's own header for why this
    //                   step comes AFTER verification, never before.
    //
    // Only after all four succeed does anything get persisted.
    //
    // Deduplicates by the attribution's own `id` — already bound into the
    // signed payload — the exact `application/LocalPlaceNamingClaimStore.js#has()`
    // reasoning applied here to `application/LocalBlueprintAttributionStore.js#has()`
    // instead. Returns `{ attribution, isNew }`: `isNew` is false for an
    // attribution this replica already knew about — never an error, the
    // ordinary cost of any gossip-style transport.
    importAttribution(pkg, { expectedFingerprint = null } = {}) {
        validateBlueprintAttributionPublication(pkg);

        const attribution = BlueprintAttribution.fromJSON(pkg);
        const result = this._verifier.verifyBlueprintAttribution(attribution.toJSON());
        if (!result.valid) {
            throw new Error(`BlueprintAttributionExchange: refusing to import an unverifiable attribution — ${result.reason}`);
        }

        // The critical rule this milestone's own design conversation
        // named: never trust the fingerprint a package merely CLAIMS when
        // the actual design content can be fingerprinted locally instead.
        // A caller that just imported the matching Blueprint Package
        // passes the fingerprint it derived from the resulting Structure
        // here; a caller importing a bare attribution with nothing local
        // to compare against simply omits it (see this class's own
        // header).
        if (expectedFingerprint && !blueprintFingerprintsEqual(expectedFingerprint, attribution.fingerprint)) {
            throw new Error('BlueprintAttributionExchange: refusing to import an attribution for a different design than the one on file — its fingerprint does not match, even though its signature verified');
        }

        if (this._store.has(attribution.fingerprint, attribution.id)) {
            this._publicationLog.recordReceipt(attribution.fingerprint, attribution.id);
            const existing = this._store.list(attribution.fingerprint)
                .find((known) => known.id === attribution.id);
            return { attribution: existing || attribution, isNew: false };
        }

        this._store.save(attribution);
        this._publicationLog.recordReceipt(attribution.fingerprint, attribution.id);
        return { attribution, isNew: true };
    }
}
