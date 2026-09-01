import { describeWorldEncounterSelectionIdentity } from '../core/WorldEncounterSelectionIdentity.js';

// 0.9.37 — World Encounter Material Verification Boundary.
//
// 0.9.33 through 0.9.36 answered "how does retrieved material reach a
// caller" for three separate provenances — local disk, a connected peer,
// and now a decentralized `uri` (0.9.35's Arweave resolver, wired by
// 0.9.36) — and every one of those files' own header repeated the same
// refusal, verbatim or near enough: "`material` is never interpreted,
// verified, or even inspected." A resolved selection names WHAT was asked
// for; a resolved lead (when one exists) names WHERE it was retrieved
// from; neither one, on its own, says whether the bytes that actually came
// back are the thing that was asked for. This file is the next seam —
// never a fourth material source, never a concrete verifier — the
// boundary a caller crosses after loading to ask exactly one question:
// does this retrieved material correspond to the selected encounter?
//
//   Nostr discovery (0.9.31)
//          │
//          ▼
//   resolvedLead = { origin, discoveryTag, uri, storage }   (0.9.28)
//          │
//          ├──────────────────────────────┐
//          ▼                              │
//   resolvedSelection = { kind,           │
//     objectId, origin }        (0.9.19)  │
//          │                              │
//          ▼                              ▼
//   0.9.34 lead-aware loading  ──►  materialSources.decentralized
//          │                        (0.9.33/0.9.35/0.9.36)
//          ▼
//   material = { id: 'P123', signature: {...}, ... }
//          │
//          │        resolvedSelection + resolvedLead + material
//          ▼
//   application/WorldEncounterMaterialVerification.js   ★ (THIS)
//        verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead,
//                                        material, verifier })
//          │
//    ┌─────┼──────────────┐
//    ▼     ▼               ▼
//  UNVERIFIABLE  REJECTED  VERIFIED
//    │                        │
//    ▼                        ▼
//   future, unscheduled: 0.9.38 (a real Publication signature verifier,
//   satisfying THIS file's own `verifyIdentity()` contract, built from
//   `identity/LocalAuthorizationVerifier.js`'s existing signature
//   machinery), 0.9.39 (wiring verification into encounter inspection)
//
// AN ORCHESTRATION BOUNDARY, NEVER A VERIFIER OF ITS OWN. This file ships
// with no concrete answer to "does this material correspond to this
// encounter" — it never reads `material.signature`, never imports `core/
// Signature.js`, `core/SigningIdentity.js`, `identity/
// LocalAuthorizationVerifier.js`, or anything naming a specific
// cryptographic scheme, and never compares `material.id` (or any other
// material field) against `resolvedSelection.objectId` itself. Exactly the
// way `application/WorldEncounterMaterialLoading.js` (0.9.21) names a
// `WorldEncounterMaterialSource` contract and ships with no concrete
// local/peer implementation, this file names a `WorldEncounterMaterialVerifier`
// contract — one method, `verifyIdentity(resolvedSelection, material,
// resolvedLead)` — and ships with no concrete implementation of it. A
// caller injects `verifier`; this file only ever calls the one method that
// contract promises and translates whatever comes back into its own
// status vocabulary. Deciding WHAT "corresponds to the selected encounter"
// means for a Publication, an AvatarProfile, or any future kind is
// entirely the injected verifier's job — see "Deliberately excluded,"
// below, for exactly why a concrete verifier is not this milestone.
//
// THREE STATUSES, NEVER TWO AND NEVER FOUR — A DELIBERATE DEPARTURE FROM
// THIS CHAIN'S OWN "TWO STATUSES, NEVER A THIRD." Every loading-boundary
// file since 0.9.21 collapses "nothing to report" down to one status
// (`UNAVAILABLE`) precisely because, for loading, absence and failure are
// the same fact: a source either has the material or it does not, and
// there is no meaningful difference between "no source was registered"
// and "the registered source came back empty." Verification is not that
// shape. "This material was never checked" (no verifier was injected, no
// material was ever loaded, or the injected verifier had no basis for a
// decision) and "this material was checked and found NOT to correspond to
// the selected encounter" are opposite facts with opposite consequences —
// collapsing them into one status would let a caller's UI, or a future
// trust decision built on top of this boundary, treat "we never looked"
// and "we looked and it failed" identically, which is exactly backwards
// for a security-relevant boundary: it must never be possible to mistake
// silence for either a pass or a fail. So `WorldEncounterMaterialVerificationStatus`
// holds exactly three values:
//   - `UNVERIFIABLE` — nothing was judged: a missing/malformed
//     `resolvedSelection`, missing `material`, no injected `verifier` (or
//     one exposing no usable `verifyIdentity` method), or an injected
//     verifier that itself returned neither `true` nor `false` (see
//     "Only a strict boolean decides," below) — this material's
//     correspondence to the selected encounter simply was never
//     established, one way or the other.
//   - `VERIFIED` — the injected verifier's own `verifyIdentity()` returned
//     exactly `true`: it actively confirmed the material corresponds to
//     `resolvedSelection`.
//   - `REJECTED` — the injected verifier's own `verifyIdentity()` returned
//     exactly `false`: it actively determined the material does NOT
//     correspond to `resolvedSelection`.
// No fourth status. No `PENDING`, `ERROR`, or `TRUSTED` — this file has no
// vocabulary for "should this be preferred over another candidate" or "do
// I trust this publisher"; see 0.9.0's own "no score, rank, trust,
// verified... vocabulary of any kind," continued here one layer up, for a
// narrower question than trust: identity correspondence alone.
//
// ONLY A STRICT BOOLEAN DECIDES — ANYTHING ELSE FROM THE INJECTED VERIFIER
// IS TREATED AS AN ABSTENTION, NEVER GUESSED AT. `verifyIdentity()` may
// return a `Promise` resolving to anything; only a resolved value of
// exactly `true` produces `VERIFIED` and only exactly `false` produces
// `REJECTED`. A verifier that resolves `null`, `undefined`, a string, or
// any other value — because it does not yet know how to judge this
// `kind`, or has not yet decided — collapses to `UNVERIFIABLE`, the same
// "nothing was judged" outcome as no verifier at all. This file never
// coerces a truthy/falsy value into a decision (`Boolean(outcome)`) —
// doing so would silently turn "I don't know" into a pass or a fail
// depending on what shape of "I don't know" a future verifier happened to
// return, which is exactly the guess this boundary exists to refuse to
// make.
//
// `resolvedSelection` IS VALIDATED FOR WELL-FORMEDNESS, `resolvedLead` IS
// OPAQUE, AND `material` IS NEVER INSPECTED — INHERITED FROM EVERY FILE IN
// THIS FAMILY. `describeWorldEncounterSelectionIdentity()` (0.9.19,
// unmodified) validates only that `resolvedSelection` is well-formed; its
// own freshly-derived return value is discarded, never substituted for the
// caller's own reference — exactly 0.9.21's, 0.9.33's, and 0.9.34's own
// restraint, continued here. `resolvedLead`, when supplied, is forwarded
// verbatim and never read by this file for any purpose — it is optional
// context a verifier MAY use (a decentralized material's own `uri` may
// matter to how it is checked) but this boundary itself never routes,
// validates, or reasons about it; local and peer material, which carry no
// lead at all, verify exactly the same way with `resolvedLead: null`. And
// `material` is passed to the injected verifier and back to the caller
// completely unexamined — no parsing, no schema check, no signature read,
// no assumption about `kind`. `resolvedSelection`, `resolvedLead`, and
// `material` are three separate facts, exactly the identities the task
// that requested this milestone named ("discovery identity," "encounter
// identity," "material identity") and none of them is ever collapsed into
// either of the others, or into one composite key, anywhere in this file.
//
// `WorldEncounterMaterialVerifier` IS THE CONTRACT A FUTURE VERIFIER
// IMPLEMENTS — MIRRORING `WorldEncounterMaterialSource`'s OWN "THROW IF
// UNIMPLEMENTED" SHAPE, ONE LAYER PAST LOADING. Calling `.verifyIdentity()`
// on the base class always throws, on purpose, so a caller that forgets to
// inject a real verifier fails loudly during development if it ever
// mistakenly holds an un-subclassed base instance, rather than silently
// observing UNVERIFIABLE for the wrong reason. This class is never
// instantiated or subclassed by this file itself — no concrete verifier
// ships here; see "Deliberately excluded," below. `verifier` is duck-typed
// exactly the way `materialSources.local`/`.peer`/`.decentralized` already
// are: any object exposing a callable `verifyIdentity` works, whether or
// not it extends this base class.
//
// A THROWN REJECTION IS NEVER SWALLOWED — inherited unchanged from every
// loading-boundary file in this chain. A rejected `verifyIdentity()`
// promise — a malformed verifier, a genuine bug, a verifier that itself
// needs network access and fails — is never caught and translated into
// `UNVERIFIABLE` here; it propagates to this function's own caller
// unchanged. `UNVERIFIABLE` means "nothing was judged," never "judging it
// failed."
//
// NO CACHING, NO RETRY, NO RANKING BETWEEN VERIFIERS. Every call to
// `verifyWorldEncounterMaterial()` calls the injected verifier's own
// `verifyIdentity()` exactly once, fresh, for exactly the one
// `resolvedSelection`/`resolvedLead`/`material` triple supplied — never
// memoized, never retried, and this file never accepts more than one
// verifier to choose or fall back between. A caller wanting a second
// opinion calls this function twice, explicitly, with a second verifier.
//
// SYNCHRONOUS VALIDATION, ASYNCHRONOUS RESULT — inherited unchanged from
// 0.9.21. This file performs no I/O of its own; whatever work
// `verifyIdentity()` actually does (a local signature check, a future
// network-backed revocation lookup) happens entirely inside the injected
// verifier.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any concrete `verifyIdentity` implementation — Publication signature
//   verification, hash verification, or content authentication of any
//   kind.** This file ships with no verifier of its own; a caller injects
//   one. Separate, later, unscheduled work (0.9.38, using this codebase's
//   existing `core/Signature.js` / `core/SigningIdentity.js` / `identity/
//   LocalAuthorizationVerifier.js` machinery).
// - **Wiring this boundary into `application/
//   DecentralizedWorldEncounterLeadAwareMaterialLoading.js`, `application/
//   WorldEncounterMaterialLoading.js`, `application/
//   WorldEncounterInspection.js`, or any UI.** Neither loading file is
//   imported or modified by this one; a caller that already holds an
//   `AVAILABLE` loading result calls this function next, explicitly, with
//   its own `resolvedSelection`/`resolvedLead`/`material` already in hand.
//   Actually wiring verification into encounter inspection is separate,
//   later, unscheduled work (0.9.39).
// - **Trust, ranking, reputation, or preference between multiple candidate
//   materials for the same encounter.** See "Three statuses, never two and
//   never four," above — this file answers "does this ONE material
//   correspond to this ONE selected encounter," never "which of several
//   should be preferred." That judgment, if it is ever built, is a
//   separate, later, unscheduled boundary sitting after this one.
// - **A `PENDING`, `ERROR`, or `TRUSTED` status, or any status beyond the
//   three named above.**
// - **Interpreting, parsing, or rendering `material` — before OR after
//   verification.** See "material is never inspected," above.
// - **Choosing among multiple decentralized backends, discovery, lead
//   resolution, or any concern already settled by 0.9.24 through 0.9.36.**
//   This file never imports any of them.

export const WorldEncounterMaterialVerificationStatus = Object.freeze({
    UNVERIFIABLE: 'UNVERIFIABLE',
    VERIFIED: 'VERIFIED',
    REJECTED: 'REJECTED'
});

// The contract a future verifier implements. Never subclassed by this
// file itself — see this file's own header, "the contract a future
// verifier implements." Calling `verifyIdentity()` on the base class
// always throws, so an un-implemented verifier fails loudly rather than
// silently reporting UNVERIFIABLE for the wrong reason.
export class WorldEncounterMaterialVerifier {
    // Returns a Promise resolving to `true` (this material corresponds to
    // `resolvedSelection`), `false` (it actively does not), or anything
    // else to abstain — see this file's own header, "Only a strict boolean
    // decides."
    verifyIdentity(resolvedSelection, material, resolvedLead) {
        throw new Error('WorldEncounterMaterialVerifier.verifyIdentity() not implemented');
    }
}

function isUsableMaterial(material) {
    return material !== null && typeof material !== 'undefined';
}

function unverifiable(resolvedSelection, resolvedLead, material) {
    return Object.freeze({
        status: WorldEncounterMaterialVerificationStatus.UNVERIFIABLE,
        resolvedSelection: resolvedSelection || null,
        resolvedLead: resolvedLead || null,
        material: isUsableMaterial(material) ? material : null
    });
}

// The one entry point a caller actually uses. Validates `resolvedSelection`
// (via 0.9.19's own `describeWorldEncounterSelectionIdentity()`, used only
// to check well-formedness) and that `material` is usable, then forwards
// all three inputs, verbatim, to the injected `verifier`'s own
// `verifyIdentity(resolvedSelection, material, resolvedLead)` — see this
// file's own header for exactly what `UNVERIFIABLE`/`VERIFIED`/`REJECTED`
// each mean and what is deliberately excluded. Never throws for a
// missing/malformed selection, missing material, or a missing verifier; a
// genuine rejection from the verifier's own `verifyIdentity()` propagates
// to the caller unchanged.
export async function verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material, verifier } = {}) {
    if (!describeWorldEncounterSelectionIdentity(resolvedSelection)) {
        return unverifiable(null, null, null);
    }

    if (!isUsableMaterial(material)) {
        return unverifiable(resolvedSelection, resolvedLead, null);
    }

    if (!verifier || typeof verifier.verifyIdentity !== 'function') {
        return unverifiable(resolvedSelection, resolvedLead, material);
    }

    const outcome = await verifier.verifyIdentity(resolvedSelection, material, resolvedLead || null);

    if (outcome === true) {
        return Object.freeze({
            status: WorldEncounterMaterialVerificationStatus.VERIFIED,
            resolvedSelection,
            resolvedLead: resolvedLead || null,
            material
        });
    }

    if (outcome === false) {
        return Object.freeze({
            status: WorldEncounterMaterialVerificationStatus.REJECTED,
            resolvedSelection,
            resolvedLead: resolvedLead || null,
            material
        });
    }

    return unverifiable(resolvedSelection, resolvedLead, material);
}
