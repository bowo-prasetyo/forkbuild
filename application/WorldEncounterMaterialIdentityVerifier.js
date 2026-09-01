import { WorldEncounterMaterialVerifier } from './WorldEncounterMaterialVerification.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.38 — World Encounter Material Identity Verifier.
//
// 0.9.37 named a seam and refused to cross it: `WorldEncounterMaterialVerifier`
// is a contract with one method, `verifyIdentity(resolvedSelection, material,
// resolvedLead)`, and 0.9.37 ships with nothing plugged into it. This file is
// the first concrete thing plugged in — an answer to exactly one narrow
// question, and nothing past it:
//
//   Does this retrieved material actually correspond to the selected
//   `{ kind, objectId }`?
//
//   resolvedSelection = { kind, objectId, origin }         (0.9.19)
//          │
//          │        material = { id / avatarId, ... }
//          │        (0.9.22 / 0.9.23 / 0.9.33 / 0.9.35 / 0.9.36)
//          ▼               │
//   application/WorldEncounterMaterialIdentityVerifier.js   ★ (THIS)
//        WorldEncounterMaterialIdentityVerifier#verifyIdentity()
//          │
//          ▼
//   application/WorldEncounterMaterialVerification.js   (0.9.37, unmodified)
//        verifyWorldEncounterMaterial()
//          │
//    ┌─────┼──────────────┐
//    ▼     ▼               ▼
//  UNVERIFIABLE  REJECTED  VERIFIED
//
//   Future, unscheduled: 0.9.39 (wiring a verification result into World
//   Encounter inspection), a later cryptographic verifier answering "does
//   the signature verify" and "does it identify the claimed publisher" —
//   see "Deliberately excluded," below, for exactly why those are not this
//   milestone either.
//
// ONE STRUCTURAL COMPARISON, KIND-SPECIFIC, NEVER A GENERIC `objectId`
// PROPERTY INVENTED ON MATERIAL. 0.9.16 (`core/WorldEncounter.js`'s own
// `describeEncounterablePublication()`/`describeEncounterableAvatar()`)
// already drew the line this file continues: a `Publication` names itself by
// `id`; an `AvatarProfile` names itself by `avatarId`. Those are two
// different fields on two different domain objects, not one shared
// convention this codebase has ever established — inventing a generic
// `material.objectId` that every material "ought" to carry would blur a
// distinction 0.9.16 deliberately kept, purely for this file's own
// convenience. So this file looks up, per `resolvedSelection.kind`, which
// field on `material` is the one that actually carries that kind's own
// identity, and compares that field alone against `resolvedSelection.objectId`:
//
//   PUBLICATION → material.id
//   AVATAR      → material.avatarId
//
// TWO KINDS, NEVER A THIRD — inherited unchanged from 0.9.0/0.9.16/0.9.19. A
// `resolvedSelection.kind` outside `WorldEncounterKind.PUBLICATION`/
// `WorldEncounterKind.AVATAR` is a kind this file simply does not yet know
// how to judge — it abstains (see "Abstaining is not failing," below) rather
// than guessing at a field name for a kind it has never been told about.
//
// STRICT STRING EQUALITY, NEVER A LOOSE OR CASE-INSENSITIVE COMPARE. Both
// `resolvedSelection.objectId` (0.9.19's own validated field) and the
// material's own identity field are compared with `===`, after confirming
// both are non-empty strings. `'P123'` and `'p123'` are different
// identities; `123` and `'123'` are different types entirely. This file
// never coerces either side before comparing.
//
// ABSTAINING IS NOT FAILING — INHERITED UNCHANGED FROM 0.9.37'S OWN "ONLY A
// STRICT BOOLEAN DECIDES." An unrecognized `kind` resolves `verifyIdentity()`
// to `undefined`, never to `false`. 0.9.37's own boundary already treats any
// non-boolean outcome as an abstention (`UNVERIFIABLE`), so a future kind
// this file has not been taught to judge never gets silently rejected as
// though it had actively failed a check it was never asked to run.
//
// MALFORMED MATERIAL IS HANDLED SAFELY, AND RESOLVES TO A STRICT `false` —
// NEVER A THROW, NEVER AN ABSTENTION. Once this file DOES recognize the
// `kind` (so it knows which field to look for), a `material` that is not an
// object, or whose identity field is missing, not a string, or empty, simply
// does not correspond to anything nameable — `resolvedSelection.objectId`
// is (by 0.9.19's own validation, already enforced one layer up by
// 0.9.37) always a non-empty string, so a material with no comparably-typed
// identity of its own can never equal it. This is a real, active
// determination ("this material does not correspond"), not "nothing was
// judged," so it is `false`, not an abstention — exactly the same posture
// 0.9.37's own flagship contradiction test already exercises for a
// wrong-but-present `id`, extended here to a missing one.
//
// NEVER READS ANYTHING ELSE ON `material`. `title`, `signature`,
// `publisherIdentity`, `displayName`, `ownerIdentity`, `position`, or any
// other field a `Publication`/`AvatarProfile` also carries is irrelevant to
// this one question and is never read here.
//
// `resolvedLead` IS ACCEPTED AND NEVER READ — inherited unchanged from
// 0.9.37's own "resolvedLead is opaque context forwarded to the verifier
// alone." A decentralized material's own `uri`/`storage`/`discoveryTag` has
// no bearing on whether the bytes that came back are the object that was
// selected; this file's third parameter exists only to satisfy the
// `WorldEncounterMaterialVerifier` contract's own shape and is never
// inspected.
//
// SYNCHRONOUS LOGIC, ASYNC CONTRACT — `verifyIdentity()` still returns a
// resolved Promise (never a bare boolean) so this class satisfies 0.9.37's
// own contract shape exactly, but the comparison itself performs no I/O,
// no network access, no storage read, and no clock read. Calling it twice
// with byte-identical arguments returns a byte-identical outcome.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Signature verification, hash verification, or any cryptographic
//   scheme.** This file never reads `material.signature`, never imports
//   `core/Signature.js`, `core/SigningIdentity.js`, or `identity/
//   LocalAuthorizationVerifier.js`. It answers "is this the object I
//   selected," never "does its signature verify" or "does the signature
//   identify the claimed publisher" — separate, later, unscheduled work.
// - **Content-hash or URI correspondence** ("does the retrieved content
//   match the claimed `uri`"). This file never reads `resolvedLead` at all.
// - **Trust, ranking, reputation, or preference of any kind.** See 0.9.37's
//   own "no score, rank, trust... vocabulary of any kind," continued here.
// - **Wiring this verifier into `application/WorldEncounterMaterialVerification.js`
//   as a default, into any material-loading file, or into `application/
//   WorldEncounterInspection.js`/any UI.** This file is a standalone
//   `WorldEncounterMaterialVerifier` a caller injects explicitly; nothing
//   here is registered anywhere. Actually wiring a verification result into
//   encounter inspection is separate, later, unscheduled work (0.9.39).
// - **A third identity field, a third kind, or a generic/composite identity
//   key.** See "One structural comparison, kind-specific," above.

const IDENTITY_FIELD_BY_KIND = Object.freeze({
    [WorldEncounterKind.PUBLICATION]: 'id',
    [WorldEncounterKind.AVATAR]: 'avatarId'
});

function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// The one concrete verifier this milestone ships. Extends 0.9.37's own
// `WorldEncounterMaterialVerifier` and implements exactly its one method —
// see this file's own header for what "correspond" means here and what it
// deliberately does not mean.
export class WorldEncounterMaterialIdentityVerifier extends WorldEncounterMaterialVerifier {
    // Returns a Promise resolving to:
    //   - `true`      — the material's own kind-specific identity field
    //                    equals `resolvedSelection.objectId` exactly.
    //   - `false`     — `resolvedSelection.kind` is recognized, but the
    //                    material's identity field is missing/mistyped or
    //                    names a different object entirely.
    //   - `undefined` — `resolvedSelection.kind` is not one this verifier
    //                    knows how to judge (abstain; see "Abstaining is
    //                    not failing," above).
    // Never throws for malformed input.
    async verifyIdentity(resolvedSelection, material, resolvedLead) {
        const { kind, objectId } = resolvedSelection && typeof resolvedSelection === 'object' ? resolvedSelection : {};
        const identityField = IDENTITY_FIELD_BY_KIND[kind];

        if (!identityField) {
            return undefined;
        }
        if (!nonEmptyString(objectId)) {
            return false;
        }
        if (!material || typeof material !== 'object') {
            return false;
        }

        const materialIdentity = material[identityField];
        if (!nonEmptyString(materialIdentity)) {
            return false;
        }

        return materialIdentity === objectId;
    }
}
