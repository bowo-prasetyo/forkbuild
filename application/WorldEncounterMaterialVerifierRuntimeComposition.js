import { WorldEncounterMaterialIdentityVerifier } from './WorldEncounterMaterialIdentityVerifier.js';
import { WorldEncounterMaterialSignatureVerifier } from './WorldEncounterMaterialSignatureVerifier.js';
import { WorldEncounterMaterialVerificationComposition } from './WorldEncounterMaterialVerificationComposition.js';

// 0.9.43 — World Encounter Material Verifier Runtime Composition.
//
// 0.9.42 built `WorldEncounterMaterialVerificationComposition` and refused,
// on purpose, to import either concrete verifier it was designed to combine
// — its own header named that refusal explicitly: "no default set of
// sub-verifiers, or knowledge of `WorldEncounterMaterialIdentityVerifier`/
// `WorldEncounterMaterialSignatureVerifier` by name." Something still has to
// actually build the one composition this codebase ships today, the same
// way `application/DecentralizedWorldEncounterMaterialRuntimeComposition.js`
// (0.9.36) is the one file that imports both `ArweaveWorldEncounterMaterialResolver`
// and `DecentralizedWorldEncounterMaterialSource` together, so that neither
// of those two files has to know about the other. This file plays the
// identical role, one layer over, for verification:
//
//   new WorldEncounterMaterialIdentityVerifier()        (0.9.38, unmodified)
//   new WorldEncounterMaterialSignatureVerifier(...)     (0.9.41, unmodified)
//                    │
//                    ▼
//   application/WorldEncounterMaterialVerifierRuntimeComposition.js   ★ (THIS)
//        composeWorldEncounterMaterialVerifier()
//                    │
//                    ▼
//   new WorldEncounterMaterialVerificationComposition({ verifiers: [...] })
//        (0.9.42, unmodified)
//                    │
//                    ▼
//        { identityVerifier, signatureVerifier, verifier }
//                    │
//                    ▼
//   a caller's own `inspectWorldEncounterMaterial({ ..., verifier })`
//   (0.9.39, unmodified) or `WorldEncounterCanvas`'s own `materialVerifier`
//   prop (0.9.39, unmodified) — either one already accepts any object
//   exposing a callable `verifyIdentity`, so `verifier` plugs in exactly
//   where a single verifier already goes, never a new entry point.
//
// COMPOSITION, NEVER A FOURTH VERIFIER ALGORITHM. This file performs no
// identity comparison and no cryptographic check of its own — it has no
// `verifyIdentity()` method anywhere in it. Its only job is object
// construction: build the two existing concrete verifiers, hand both to
// 0.9.42's own composition class, return the result. Every verification
// behavior a caller ever observes through the object this file returns is
// entirely 0.9.38's, 0.9.41's, and 0.9.42's own, unmodified.
//
// THIS IS THE ONE PLACE IN THIS CODEBASE THAT NAMES BOTH CONCRETE VERIFIERS
// TOGETHER. 0.9.38's own header calls that restraint out for itself
// (`WorldEncounterMaterialIdentityVerifier` never imports the signature
// verifier); 0.9.41's own header holds the same restraint in the other
// direction; 0.9.42's own header refuses to name either one by class. This
// file is where that refusal is deliberately allowed to end — a real
// composition root has to build something concrete eventually, and this is
// that one seam, exactly the way 0.9.36 is the one seam for the
// decentralized retrieval side.
//
// `authorizationVerifier` IS THE ONLY CONFIGURABLE SEAM, FORWARDED VERBATIM
// TO `WorldEncounterMaterialSignatureVerifier`'s OWN CONSTRUCTOR — never
// reinterpreted or defaulted a second time here. `WorldEncounterMaterialIdentityVerifier`
// takes no constructor arguments at all (0.9.38), so there is nothing else
// for a caller to configure. Omitting `authorizationVerifier` lets
// `WorldEncounterMaterialSignatureVerifier`'s own constructor build its own
// default `LocalAuthorizationVerifier`, exactly as it already does when
// constructed directly.
//
// THE COMPOSITION ORDER IS IDENTITY, THEN SIGNATURE — NEVER A CHOICE THIS
// FILE EXPECTS A CALLER TO MAKE. 0.9.42's own header documents that a
// strict `false` short-circuits the remaining sub-verifiers; placing the
// (cheaper, purely structural) identity check first means a wrong
// `objectId` never pays for a cryptographic signature check that could not
// change the outcome. This is a performance detail, not a semantic one —
// 0.9.42's own reduction is order-independent for its final `true`/`false`/
// `undefined` outcome; nothing here relies on evaluation order for
// correctness.
//
// EVERY CALL BUILDS A FRESH, INDEPENDENT SET — NO MODULE-LEVEL STATE, NO
// SINGLETON, NO CACHING OF A PREVIOUSLY-COMPOSED VERIFIER. Calling
// `composeWorldEncounterMaterialVerifier()` twice constructs two entirely
// independent verifier instances; neither call reads or writes anything
// outside its own arguments and return value — the same restraint
// `application/DecentralizedWorldEncounterMaterialRuntimeComposition.js`'s
// own header already holds for its own composed pair.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any caller that actually invokes this composition against a running
//   application.** This file builds the object; wiring it into
//   `ui/main.js`'s own dependency graph, or into any other running
//   composition root, remains a separate, later, unscheduled step — the
//   same restraint 0.9.36's own header already holds for its own
//   `composeWorldEncounterMaterialSources()`.
// - **A default, richer, or per-kind applicability policy between the two
//   sub-verifiers.** This file composes exactly the two verifiers that
//   exist today, in the fixed order named above; see 0.9.42's own
//   "Deliberately excluded" for why a richer applicability signal remains
//   out of scope here too.
// - **A third concrete verifier, or any policy for choosing among more than
//   the two composed here.** A future verifier, if one is ever built, is
//   composed by a caller passing its own `verifiers` array directly to
//   `WorldEncounterMaterialVerificationComposition` — this file's own fixed
//   two-verifier composition is a convenience, never the only way to build
//   one.
export function composeWorldEncounterMaterialVerifier({ authorizationVerifier } = {}) {
    const identityVerifier = new WorldEncounterMaterialIdentityVerifier();
    const signatureVerifier = new WorldEncounterMaterialSignatureVerifier(
        authorizationVerifier ? { authorizationVerifier } : {}
    );
    const verifier = new WorldEncounterMaterialVerificationComposition({
        verifiers: [identityVerifier, signatureVerifier]
    });

    return Object.freeze({ identityVerifier, signatureVerifier, verifier });
}
