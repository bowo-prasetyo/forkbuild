import { WorldEncounterMaterialVerifier } from './WorldEncounterMaterialVerification.js';

// 0.9.42 — World Encounter Material Verification Composition.
//
// 0.9.38 (`WorldEncounterMaterialIdentityVerifier`) and 0.9.41
// (`WorldEncounterMaterialSignatureVerifier`) each answer a different,
// independent question about the same material — "is this the selected
// object" and "does its signature verify" — and each already plugs into
// 0.9.37's own `verifyWorldEncounterMaterial()` exactly the way that
// file's own header always intended: "a caller wanting a second opinion
// calls this function twice, explicitly, with a second verifier." That
// works, but it leaves every CALLER to re-derive, by hand, the same
// judgment call every time two or more verifiers are involved: if the
// first says yes and the second abstains, is the material VERIFIED,
// UNVERIFIABLE, or something else? Left unanswered here, that judgment
// call would otherwise be made ad hoc, inconsistently, wherever
// `WorldEncounterCanvas.js` (or any future caller) happens to invoke
// more than one verifier — exactly the kind of security-relevant
// decision this codebase's own verification boundary exists to keep out
// of the UI layer. This file is that one answer, in one place:
//
//   material
//      │
//      ├──────────────────────┬───────────────────────┐
//      ▼                      ▼                        ▼
//   verifier 1             verifier 2             verifier N
//   true/false/            true/false/            true/false/
//   undefined              undefined              undefined
//      │                      │                        │
//      └──────────────────────┴───────────────────────┘
//                              ▼
//   application/WorldEncounterMaterialVerificationComposition.js   ★ (THIS)
//        WorldEncounterMaterialVerificationComposition#verifyIdentity()
//                              │
//                              ▼
//                     true / false / undefined
//                              │
//                              ▼
//   application/WorldEncounterMaterialVerification.js   (0.9.37, unmodified)
//        verifyWorldEncounterMaterial()
//                              │
//                ┌─────────────┼──────────────┐
//                ▼              ▼               ▼
//          UNVERIFIABLE     REJECTED        VERIFIED
//
//   Future, unscheduled: wiring a composed verifier into World Encounter
//   inspection or the canvas UI (0.9.43); a richer per-verifier
//   applicability signal (see "What this file deliberately does NOT
//   attempt," below).
//
// A COMPOSITE VERIFIER, NOT A FOURTH ORCHESTRATION BOUNDARY.
// `WorldEncounterMaterialVerificationComposition` extends 0.9.37's own
// `WorldEncounterMaterialVerifier` base class and implements exactly the
// one method that contract requires — `verifyIdentity(resolvedSelection,
// material, resolvedLead)` — so it is not a new kind of thing this
// codebase has to learn: it is just another verifier, indistinguishable
// from `WorldEncounterMaterialIdentityVerifier` or
// `WorldEncounterMaterialSignatureVerifier` from the outside. A caller
// hands it to `verifyWorldEncounterMaterial()` or
// `inspectWorldEncounterMaterial()` exactly where a single verifier
// already goes — no new entry point, no second status vocabulary, and no
// change to either of those files, which remain completely unmodified.
// Because it is itself a `WorldEncounterMaterialVerifier`, a composition
// can even wrap another composition — this file neither encourages nor
// forbids that; it falls out of satisfying the same contract, unplanned
// and untested beyond what that contract already guarantees.
//
// THE SEMANTIC RULE: REJECTED BEATS UNVERIFIABLE BEATS VERIFIED. Given
// the outcomes of every supplied sub-verifier:
//   - ANY sub-verifier resolving exactly `false` makes the whole
//     composition `false` — one active contradiction is enough to reject
//     the material outright, no matter what the others said or would have
//     said.
//   - Otherwise, if EVERY sub-verifier resolved exactly `true`, and at
//     least one sub-verifier was actually supplied, the composition
//     resolves `true`.
//   - Otherwise (no `false` anywhere, but at least one sub-verifier
//     abstained, was malformed, or none were supplied at all) the
//     composition abstains — `undefined` — exactly 0.9.37's own "only a
//     strict boolean decides," continued one layer up: an abstention
//     anywhere in the group is never silently dropped or coerced into a
//     pass.
// This is the identical three-row table this milestone was scoped
// against — "all applicable verifiers true → VERIFIED," "any applicable
// verifier false → REJECTED," "no rejection but at least one abstention →
// UNVERIFIABLE" — expressed here at the `true`/`false`/`undefined` layer
// this file actually operates at, one step before 0.9.37's own boundary
// turns that single outcome into `VERIFIED`/`REJECTED`/`UNVERIFIABLE`.
//
// WHAT THIS FILE DELIBERATELY DOES NOT ATTEMPT: TELLING "GENUINELY DOES
// NOT APPLY" APART FROM "ABSTAINED FOR SOME OTHER REASON." Two materials
// can produce the identical sub-verifier outcome pair — `[true,
// undefined]`, an identity verifier confirming correspondence and a
// signature verifier abstaining — for two different underlying reasons:
// today's `WorldEncounterMaterialSignatureVerifier` (0.9.41) abstains
// BOTH when `resolvedSelection.kind` is `AVATAR` (a kind it was never
// asked to judge at all) AND when a `PUBLICATION` is legitimately,
// legacy-unsigned (`{ signed: false }`, "structurally fine, just
// unsigned"). A caller might reasonably want those two cases to resolve
// differently — an avatar with a confirmed identity has nothing else to
// check and could stand as fully verified, while an unsigned publication
// arguably should not, once signing is expected. This file does NOT
// attempt that distinction, on purpose: every sub-verifier in this
// codebase, today, reports its abstention through the exact same
// `undefined` 0.9.37's own contract already defines, with no separate
// "this does not apply to this kind at all" signal distinguishable from
// "this applies but I have nothing to decide." Building that distinction
// here would mean one of two things, and this file refuses both: either
// (a) this generic composition would have to know, by name, which
// concrete verifier classes exist and which `kind`s each one "really"
// applies to — precisely the thing this file's own opening paragraph
// promises never to do ("combine multiple independent verifiers without
// knowing their internal algorithms"), turning a reusable reducer into a
// registry of special cases that breaks the moment a new verifier ships;
// or (b) this file would have to guess, from `resolvedSelection.kind`
// alone, a general applicability policy no verifier here has ever
// declared — inventing exactly the kind of unrequested security policy
// this milestone's own design discussion warned against baking into a
// generic reducer. So this file treats every abstention identically,
// regardless of why it happened, and fails closed: UNVERIFIABLE, never
// guessed into VERIFIED. Giving an individual verifier a way to declare
// its own applicability explicitly — an `appliesTo(resolvedSelection)`
// method, or a richer three-state-plus-applicability return shape — is a
// separate, later, unscheduled change to the `WorldEncounterMaterialVerifier`
// contract itself (and to every verifier that implements it), never
// smuggled into this file alone.
//
// EVERY SUPPLIED SUB-VERIFIER IS ASKED, ALWAYS, UP TO THE FIRST STRICT
// `false`. This file calls each sub-verifier's own `verifyIdentity()` in
// the order `verifiers` was supplied, awaiting each one before starting
// the next. The moment one resolves exactly `false`, this file returns
// `false` immediately without asking any remaining sub-verifiers — since
// a single contradiction already decides the whole composition, calling
// the rest could not change the answer, only spend more work reaching
// it. Short of that, every sub-verifier is asked exactly once; none is
// ever asked twice, cached, retried, or skipped for any other reason.
//
// SUB-VERIFIERS ARE DUCK-TYPED, EXACTLY LIKE 0.9.37'S OWN INJECTED
// `verifier`. An entry in `verifiers` that is missing, `null`, or exposes
// no callable `verifyIdentity` is never a `TypeError` and never
// guessed at as a contradiction — it is treated as its own abstention
// (a `false`, a genuine sub-verifier decision, is never inferred from a
// caller's own malformed entry) and folded into this file's own
// abstain-unless-all-true rule exactly like a sub-verifier that itself
// returned `undefined`.
//
// A THROWN REJECTION FROM A SUB-VERIFIER IS NEVER SWALLOWED — inherited
// unchanged from 0.9.37's own "a thrown rejection is never swallowed." A
// sub-verifier's `verifyIdentity()` that rejects propagates straight
// through this file's own `verifyIdentity()`, unmodified and uncaught,
// to whatever called this composition (`verifyWorldEncounterMaterial()`,
// `inspectWorldEncounterMaterial()`, or a caller invoking it directly).
// This file never turns "asking a sub-verifier failed" into an
// abstention — those are different facts, exactly as 0.9.37's own header
// already insists one layer down.
//
// `resolvedSelection`/`material`/`resolvedLead` ARE FORWARDED VERBATIM TO
// EVERY SUB-VERIFIER, NEVER VALIDATED, INSPECTED, OR RESHAPED HERE. This
// file reads none of their fields — no `resolvedSelection.kind`, no
// `resolvedSelection.objectId`, no `material.id`/`.signature`, no
// `resolvedLead.uri`. Each sub-verifier already validates and interprets
// them however its own contract promises; this file's only job is
// collecting what each one decides and reducing that set of decisions to
// one, exactly the restraint 0.9.38's and 0.9.41's own headers already
// hold toward `resolvedLead`, extended here to every argument.
//
// ZERO SUB-VERIFIERS IS AN ABSTENTION, NEVER A VACUOUS PASS. An empty (or
// entirely absent) `verifiers` list resolves `verifyIdentity()` to
// `undefined` — nothing was actually asked, so nothing was actually
// confirmed. This file never treats "there was nothing to contradict" as
// "therefore it is verified," the same trap an empty `Array.prototype.every()`
// would otherwise fall into.
//
// NO NEW STATUS VOCABULARY, NO SCORE, NO WEIGHTING BETWEEN SUB-VERIFIERS.
// This file introduces no fourth outcome beyond `true`/`false`/`undefined`
// and no notion that one sub-verifier's opinion counts for more than
// another's — every sub-verifier is asked the identical question and
// answered with identical weight, inherited unchanged from 0.9.37's own
// "no score, rank, trust... vocabulary of any kind."
//
// SYNCHRONOUS LOGIC, ASYNCHRONOUS CONTRACT — inherited unchanged from
// every verifier in this chain. This file performs no I/O, no network
// access, and no storage read of its own; every byte of actual work
// happens inside whichever sub-verifiers it was given.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Distinguishing "genuinely does not apply to this kind" from "applies
//   but abstained for another reason."** See "What this file deliberately
//   does not attempt," above — this requires a richer per-verifier
//   contract this milestone does not introduce.
// - **Wiring a composed verifier into `application/
//   WorldEncounterMaterialVerification.js` as a default, into
//   `application/WorldEncounterMaterialInspection.js`, or into any UI.**
//   Neither file is imported or modified by this one; a caller constructs
//   `WorldEncounterMaterialVerificationComposition` explicitly and injects
//   it exactly where a single verifier already goes. Actually wiring a
//   composed verifier into inspection or the canvas is separate, later,
//   unscheduled work (0.9.43).
// - **Weighting, ranking, or preferring one sub-verifier's opinion over
//   another's.** See "no score, rank, trust... vocabulary," above.
// - **Short-circuiting on the first abstention.** A sub-verifier resolving
//   anything other than `true`/`false` never stops the remaining
//   sub-verifiers from being asked — only a strict `false` does, since only
//   a `false` can no longer be changed by what is asked next.
// - **A default set of sub-verifiers, or knowledge of
//   `WorldEncounterMaterialIdentityVerifier`/`WorldEncounterMaterialSignatureVerifier`
//   by name.** This file imports neither; `verifiers` is supplied entirely
//   by the caller.

// The one concrete composition this milestone ships. Extends 0.9.37's own
// `WorldEncounterMaterialVerifier` and implements exactly its one method
// — see this file's own header for exactly what "composed" means here
// and what it deliberately does not mean.
export class WorldEncounterMaterialVerificationComposition extends WorldEncounterMaterialVerifier {
    constructor({ verifiers = [] } = {}) {
        super();
        this._verifiers = Array.isArray(verifiers) ? verifiers.slice() : [];
    }

    // Returns a Promise resolving to:
    //   - `false`     — at least one supplied sub-verifier resolved exactly
    //                    `false`; the sub-verifiers after it are never
    //                    asked (see "Every supplied sub-verifier is asked,
    //                    always, up to the first strict false," above).
    //   - `true`      — every supplied sub-verifier resolved exactly
    //                    `true`, and at least one was supplied.
    //   - `undefined` — no sub-verifiers were supplied, or none resolved
    //                    `false` but at least one abstained (resolved
    //                    anything other than `true`, including a
    //                    malformed sub-verifier entry) — see "Zero
    //                    sub-verifiers is an abstention," above.
    // Never throws for a malformed `verifiers` entry; a genuine rejection
    // from a sub-verifier's own `verifyIdentity()` propagates unchanged.
    async verifyIdentity(resolvedSelection, material, resolvedLead) {
        if (this._verifiers.length === 0) {
            return undefined;
        }

        let sawAbstention = false;

        for (const subVerifier of this._verifiers) {
            if (!subVerifier || typeof subVerifier.verifyIdentity !== 'function') {
                sawAbstention = true;
                continue;
            }

            const outcome = await subVerifier.verifyIdentity(resolvedSelection, material, resolvedLead);

            if (outcome === false) {
                return false;
            }
            if (outcome !== true) {
                sawAbstention = true;
            }
        }

        return sawAbstention ? undefined : true;
    }
}
