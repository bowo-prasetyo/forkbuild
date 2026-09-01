import { WorldEncounterMaterialVerifier } from './WorldEncounterMaterialVerification.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { Publication } from '../publisher/Publication.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.41 — World Encounter Material Signature Verifier.
//
// 0.9.38 shipped the first concrete `WorldEncounterMaterialVerifier`
// (`WorldEncounterMaterialIdentityVerifier`) and drew its own line in the
// sand: "does this material correspond to the selected encounter," answered
// purely structurally (`Publication.id`/`AvatarProfile.avatarId` equality),
// with signature verification named twice as separate, later, unscheduled
// work — once in 0.9.37's own "Deliberately excluded" ("a later cryptographic
// verifier answering 'does the signature verify' and 'does it identify the
// claimed publisher'"), and again in 0.9.38's own ("This file never reads
// material.signature... It answers 'is this the object I selected,' never
// 'does its signature verify'... separate, later, unscheduled work"). This
// file is that separate, later work — a SECOND concrete verifier answering a
// narrower, different question than 0.9.38's own:
//
//   Was this material's own signature produced by the identity it claims,
//   using this codebase's existing Ed25519 signing machinery?
//
//   resolvedSelection = { kind, objectId, origin }              (0.9.19/20)
//          │
//          │        material = { id, signature, publisherIdentity, ... }
//          │        (0.9.22/0.9.33/0.9.35/0.9.36 — a Publication instance,
//          │         or a plain JSON object shaped like one)
//          ▼               │
//   application/WorldEncounterMaterialSignatureVerifier.js   ★ (THIS)
//        WorldEncounterMaterialSignatureVerifier#verifyIdentity()
//          │
//          ▼
//   identity/LocalAuthorizationVerifier.js   (unmodified)
//        verifyPublication()
//          │
//          ▼
//   application/WorldEncounterMaterialVerification.js   (0.9.37, unmodified)
//        verifyWorldEncounterMaterial()
//          │
//    ┌─────┼──────────────┐
//    ▼     ▼               ▼
//  UNVERIFIABLE  REJECTED  VERIFIED
//
//   Future, unscheduled: content-hash/uri correspondence ("does the
//   retrieved content match what the lead's own uri claimed"), composing
//   this verifier's own outcome with 0.9.38's structural one (0.9.37's own
//   established pattern — "a caller wanting a second opinion calls this
//   function twice, explicitly, with a second verifier" — is how that
//   composition already happens today, with no new machinery needed here).
//
// A SECOND, INDEPENDENT VERIFIER — NEVER A REPLACEMENT FOR, OR A CHANGE TO,
// `WorldEncounterMaterialIdentityVerifier`. That file is untouched by this
// milestone, and this file never imports it. 0.9.37's own boundary accepts
// exactly one `verifier` per call; a caller wanting BOTH the structural
// "is this the right object" answer and this file's own "does the signature
// verify" answer calls `verifyWorldEncounterMaterial()`/
// `inspectWorldEncounterMaterial()` twice, once per verifier, exactly as
// 0.9.37's own header already establishes for combining opinions — this file
// introduces no meta-verifier, no "AND"/"OR" composition of outcomes, and no
// third verifier class that wraps both.
//
// ONLY `PUBLICATION` IS JUDGED — `AVATAR` ALWAYS ABSTAINS, NEVER A THIRD
// KIND. `core/AvatarProfile.js` carries no `signature`/`publisherIdentity`
// fields at all today — there is no cryptographic layer over an avatar's own
// material for this file to check, unlike `core/Publication.js`'s own
// 0.2.16 trust layer. Per 0.9.37's own "abstaining is not failing," an
// `AVATAR` selection (or any kind this file does not recognize) resolves
// `verifyIdentity()` to `undefined` — this file was never asked to judge it,
// so it never guesses at a `false`. A future avatar signing layer, if one is
// ever built, is a separate, later, unscheduled extension of this file (or a
// third verifier alongside it) — never assumed here.
//
// "NOTHING TO CRYPTOGRAPHICALLY CHECK" IS AN ABSTENTION, NEVER A PASS AND
// NEVER A FAIL. `identity/LocalAuthorizationVerifier.js#verifyPublication()`
// already draws this exact line one layer down: a pre-0.2.16 legacy
// Publication with no `signature` field at all reports `{ valid: true,
// signed: false }` — "structurally fine, just unsigned" — precisely so
// existing, never-signed publications keep working. Collapsing that into
// this file's own `true` would let an entirely unsigned publication register
// as cryptographically VERIFIED, which is exactly backwards; collapsing it
// into `false` would actively REJECT material nobody ever claimed to sign.
// So this file reads `signed` before `valid`: `signed === false` (nothing
// was ever cryptographically asserted) abstains, `undefined`, regardless of
// what `valid` says. Only when `signed === true` does this file's own
// outcome become a strict `result.valid === true`/`false` — the same
// "only a strict boolean decides" restraint 0.9.37's own boundary already
// holds one layer up, held here again for `identity/
// LocalAuthorizationVerifier.js`'s own three-state result.
//
// MATERIAL IS ACCEPTED AS EITHER A REAL `Publication` INSTANCE OR A PLAIN
// JSON OBJECT SHAPED LIKE ONE — NEVER ASSUMED TO BE ONE OR THE OTHER. A
// local-origin load (`application/LocalWorldEncounterMaterialSource.js`,
// 0.9.22) already hands back a real `Publication` domain object; a
// decentralized-origin load (`application/
// ArweaveWorldEncounterMaterialResolver.js`, 0.9.35) hands back plain parsed
// JSON — that file's own header is explicit that it "has no idea whether the
// JSON object it just parsed is a Publication... no `Publication.fromJSON()`"
// call of its own. This file is where that gap finally closes for the
// signature question: `material instanceof Publication` is used directly;
// anything else is passed through `Publication.fromJSON()` — the exact same
// re-hydration `Publication`'s own `toJSON()`/`fromJSON()` round trip already
// guarantees elsewhere in this codebase — before being handed to
// `verifyPublication()`. Neither path re-derives, re-shapes, or trusts any
// field beyond what `Publication.fromJSON()` itself already extracts.
//
// A MALFORMED OR ADVERSARIAL `material` NEVER THROWS — INCLUDING FROM
// `identity/LocalAuthorizationVerifier.js`'s OWN Ed25519 MACHINERY. Decoding
// a garbage `publicKey`/`signature` hex string is a genuine `throw` inside
// `identity/Ed25519.js#hexToBytes()` — reachable here because decentralized
// material is attacker-influenced, parsed JSON with no schema enforced
// before this file ever sees it (see `application/
// ArweaveWorldEncounterMaterialResolver.js`'s own header, "material is
// returned exactly as parsed"). Every call into `verifyPublication()` is
// therefore wrapped: a thrown error from malformed cryptographic material is
// caught and reported as a strict `false` — a genuinely broken signature
// (whether from tampering or simple corruption) is an active determination
// that verification failed, the identical `{ valid: false, signed: true,
// reason: 'signature verification failed' }` outcome a well-formed-but-wrong
// signature already produces one layer down — never an abstention, and never
// an unhandled rejection propagating up through `application/
// WorldEncounterMaterialVerification.js` into a caller's UI.
//
// NEVER RE-CHECKS STRUCTURAL IDENTITY. This file never reads
// `resolvedSelection.objectId` against `material.id`/`.avatarId` — that
// question is already fully answered by `WorldEncounterMaterialIdentityVerifier`
// (0.9.38), unmodified. This file answers a narrower, orthogonal question:
// given the material as retrieved, does IT carry a signature that checks
// out. A publication whose `id` is wrong but whose signature verifies
// perfectly well (a real, differently-scoped publication, correctly signed)
// still resolves `true` here — that is a DIFFERENT fact than "is this the
// object I selected," never a contradiction of it. Composing the two facts
// is left to a caller (see "a second, independent verifier," above).
//
// `resolvedLead` IS ACCEPTED AND NEVER READ — inherited unchanged from
// 0.9.37's own "resolvedLead is opaque context forwarded to the verifier
// alone" and 0.9.38's own identical restraint one layer up. A decentralized
// material's own `uri`/`storage`/`discoveryTag` has no bearing on whether
// its OWN embedded signature checks out; content-hash/uri correspondence
// (does the retrieved content match what a lead's own uri claimed) is a
// separate, later, unscheduled question this file does not answer.
//
// `identity/LocalAuthorizationVerifier.js` IS INJECTED, DEFAULTED, NEVER
// REQUIRED FROM A CALLER. Exactly the way `application/
// LocalWorldEncounterMaterialSource.js` (0.9.22) constructs its own
// `LocalDiscoveryProvider` from the `storageProvider` it is given rather than
// requiring a caller to build and hand one in, this file constructs its own
// default `LocalAuthorizationVerifier` when none is supplied — `identity/
// LocalAuthorizationVerifier.js` needs no world/storage/network context to
// construct, so there is nothing for a caller to inject in the common case.
// The constructor still accepts an explicit `authorizationVerifier` purely
// as a test/substitution seam, exactly like `application/
// ArweaveWorldEncounterMaterialResolver.js`'s own `fetchImpl` injection
// point — never a second, competing cryptographic scheme this file chooses
// between.
//
// SYNCHRONOUS LOGIC, ASYNC CONTRACT — inherited unchanged from 0.9.38.
// `verifyIdentity()` still returns a resolved Promise to satisfy 0.9.37's
// own contract shape, but the check itself performs no I/O, no network
// access, and no storage read — everything `identity/
// LocalAuthorizationVerifier.js#verifyPublication()` does is a pure,
// synchronous computation over the material and signature already in hand.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Structural identity correspondence (`material.id`/`.avatarId` against
//   `resolvedSelection.objectId`).** See "never re-checks structural
//   identity," above — that is `WorldEncounterMaterialIdentityVerifier`'s
//   (0.9.38) own, separate job, unmodified and un-imported here.
// - **Content-hash or uri correspondence** ("does the retrieved content
//   match the claimed `uri`"). This file never reads `resolvedLead` at all.
// - **A meta-verifier, or any composition of this file's own outcome with
//   0.9.38's structural one.** See "a second, independent verifier," above
//   — a caller calls `verifyWorldEncounterMaterial()` twice.
// - **Signing anything, or any write path.** This file only ever verifies
//   an already-produced signature; it never constructs one, and never
//   imports `identity/LocalIdentityProvider.js` or anything that signs.
// - **A cryptographic verifier for `AVATAR` material.** See "only PUBLICATION
//   is judged," above — `core/AvatarProfile.js` carries no signature layer
//   for this file to check today.
// - **Trust, ranking, reputation, or preference of any kind.** See 0.9.37's
//   own "no score, rank, trust... vocabulary of any kind," continued here.
// - **Wiring this verifier into `application/WorldEncounterMaterialVerification.js`
//   as a default, into any material-loading file, into `application/
//   WorldEncounterMaterialInspection.js`, or into any UI.** This file is a
//   standalone `WorldEncounterMaterialVerifier` a caller injects explicitly,
//   exactly like 0.9.38 before it — nothing here is registered anywhere.

function isPublicationLike(material) {
    return material !== null && typeof material === 'object';
}

// The one concrete verifier this milestone ships. Extends 0.9.37's own
// `WorldEncounterMaterialVerifier` and implements exactly its one method —
// see this file's own header for what "verified" means here and what it
// deliberately does not mean.
export class WorldEncounterMaterialSignatureVerifier extends WorldEncounterMaterialVerifier {
    constructor({ authorizationVerifier = null } = {}) {
        super();
        this._authorizationVerifier = authorizationVerifier || new LocalAuthorizationVerifier();
    }

    // Returns a Promise resolving to:
    //   - `true`      — material.signature verifies, and its signer IS the
    //                    claimed publisherIdentity (identity/
    //                    LocalAuthorizationVerifier.js#verifyPublication()
    //                    returned `{ valid: true, signed: true }`).
    //   - `false`     — a signature is present but does not check out
    //                    (`{ valid: false, signed: true }`), OR the
    //                    cryptographic material was too malformed to even
    //                    attempt verification (see "a malformed or
    //                    adversarial material never throws," above).
    //   - `undefined` — `resolvedSelection.kind` is not `PUBLICATION`, the
    //                    material could not be treated as one at all, or the
    //                    material carries no signature to check
    //                    (`{ signed: false }`) — abstain; see "'nothing to
    //                    cryptographically check' is an abstention," above.
    // Never throws for malformed input.
    async verifyIdentity(resolvedSelection, material, resolvedLead) {
        const kind = resolvedSelection && typeof resolvedSelection === 'object' ? resolvedSelection.kind : null;
        if (kind !== WorldEncounterKind.PUBLICATION) {
            return undefined;
        }

        if (!isPublicationLike(material)) {
            return undefined;
        }

        const publication = material instanceof Publication ? material : Publication.fromJSON(material);
        if (!publication) {
            return undefined;
        }

        let result;
        try {
            result = this._authorizationVerifier.verifyPublication(publication);
        } catch {
            return false;
        }

        if (!result || !result.signed) {
            return undefined;
        }

        return result.valid === true;
    }
}
