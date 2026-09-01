import { loadWorldEncounterMaterial } from './WorldEncounterMaterialLoading.js';
import { loadWorldEncounterMaterialFromResolvedLead } from './DecentralizedWorldEncounterLeadAwareMaterialLoading.js';
import { verifyWorldEncounterMaterial } from './WorldEncounterMaterialVerification.js';

// 0.9.39 — World Encounter Material Inspection Orchestration.
//
// 0.9.16 through 0.9.20 built selection and its resolution; 0.9.21/0.9.34
// each built a loading boundary (`origin`-routed, and lead-routed); 0.9.37
// built a verification boundary; 0.9.38 plugged the first concrete verifier
// into it. Every one of those files' own header drew the same line at its
// own layer — "wiring this into encounter inspection is separate, later,
// unscheduled work (0.9.39)." This file is that wiring, and only that
// wiring: given a resolved selection (and, optionally, a resolved
// decentralized lead), load the material a caller already has the means to
// load, then ask whether it corresponds to what was selected.
//
//   resolvedSelection = { kind, objectId, origin }              (0.9.19/20)
//   resolvedLead = { origin, discoveryTag, uri, storage }?      (0.9.28)
//                       │
//                       ▼
//   application/WorldEncounterMaterialInspection.js   ★ (THIS)
//        inspectWorldEncounterMaterial()
//                       │
//         no resolvedLead        a resolvedLead was supplied
//                       │                     │
//                       ▼                     ▼
//   WorldEncounterMaterialLoading.js   DecentralizedWorldEncounterLead
//   (0.9.21, unmodified)               AwareMaterialLoading.js (0.9.34,
//        loadWorldEncounterMaterial()  unmodified)
//                                           loadWorldEncounterMaterialFrom
//                                           ResolvedLead()
//                       │                     │
//                       └──────────┬──────────┘
//                                  ▼
//                    loading = { status, resolvedSelection, material, ... }
//                                  │
//                                  ▼
//   WorldEncounterMaterialVerification.js   (0.9.37, unmodified)
//        verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead,
//                                        material: loading.material, verifier })
//                                  │
//                                  ▼
//                verification = { status, resolvedSelection,
//                                  resolvedLead, material }
//                                  │
//                                  ▼
//        { selection, lead, loading, verification }
//
// AN ORCHESTRATION BOUNDARY, NEVER A FOURTH LOADER AND NEVER A SECOND
// VERIFIER. This file performs no retrieval and no identity judgment of its
// own — it never reads `material.id`/`material.avatarId`, never imports
// `core/WorldEncounter.js`, never constructs a `WorldEncounterMaterialSource`
// or `WorldEncounterMaterialVerifier`, and never touches
// `materialSources.local`/`.peer`/`.decentralized` directly. It calls
// exactly two already-existing, unmodified boundaries — a loading boundary,
// then the verification boundary — and hands back what each one already
// computed, together.
//
// ROUTING IS DECIDED BY PRESENCE ALONE, NEVER BY READING `origin`. Exactly
// like 0.9.34's own header already establishes one layer down ("calling
// this function at all is the routing decision"), this file never reads
// `resolvedSelection.origin`, `resolvedLead.origin`, `.discoveryTag`, or
// `.storage` to decide which loading boundary to call. A caller that
// already holds a resolved decentralized lead passes it in; this file
// reacts to that alone — `resolvedLead` truthy routes through 0.9.34's own
// `loadWorldEncounterMaterialFromResolvedLead()`, and its absence (`null`,
// `undefined`, or simply omitted) routes through 0.9.21's own
// `loadWorldEncounterMaterial()`. Neither loading boundary is ever called
// more than once per call to this function, and this file never falls back
// from one to the other — a caller who wants both attempted calls this
// function twice, explicitly, with and without a lead.
//
// NEITHER `resolvedSelection` NOR `resolvedLead` IS VALIDATED HERE — BOTH
// UNDERLYING BOUNDARIES ALREADY DO. `loadWorldEncounterMaterial()` and
// `loadWorldEncounterMaterialFromResolvedLead()` each already validate
// `resolvedSelection` via 0.9.19's own `describeWorldEncounterSelectionIdentity()`
// (and, for the latter, `resolvedLead`'s own usable `uri`), degrading to
// `UNAVAILABLE` rather than throwing; `verifyWorldEncounterMaterial()`
// independently performs the identical `resolvedSelection` check before
// ever considering `material`. Re-validating either one here would be a
// second copy of logic those boundaries already own — this file trusts
// each one's own established degrade path rather than reimplementing it.
// A missing or malformed `resolvedSelection` therefore still produces a
// well-formed, frozen result: `loading` and `verification` each degrade to
// their own already-defined "nothing to report" shape, and this file's own
// `selection` field mirrors whatever was actually passed in (see
// "`selection`/`lead` are the caller's own inputs, forwarded verbatim,"
// below) rather than a re-derived value.
//
// `selection`/`lead` ARE THE CALLER'S OWN INPUTS, FORWARDED VERBATIM —
// NEVER RE-DERIVED FROM `loading` OR `verification`. Both loading boundaries
// and the verification boundary already forward `resolvedSelection`
// (and, where applicable, `resolvedLead`) by reference; this file's own
// top-level `selection`/`lead` fields are simply the exact arguments this
// function itself received (`|| null` only to normalize an omitted
// argument), never a value read back off either nested result. A caller
// wanting the specific, possibly-null-substituted references those two
// boundaries themselves computed still has them, unchanged, inside
// `loading`/`verification`.
//
// `material` IS NEVER INSPECTED, HERE OR IN EITHER BOUNDARY THIS FILE
// CALLS. Whatever `loading.material` holds (a real record, or `null` when
// loading came back `UNAVAILABLE`) is forwarded to `verifyWorldEncounterMaterial()`
// exactly as loading produced it — never parsed, never schema-checked. When
// loading is `UNAVAILABLE`, `loading.material` is already `null`;
// `verifyWorldEncounterMaterial()`'s own `isUsableMaterial` check already
// turns that into `UNVERIFIABLE` *without ever calling the injected
// verifier* — this file adds no special case for "material could not be
// loaded" because 0.9.37 already handles it, one layer down, exactly the
// way the task that requested this milestone described: UNAVAILABLE
// material verifies as UNVERIFIABLE, never REJECTED and never silently
// skipped.
//
// NO NEW STATUS VOCABULARY. This file introduces no third status enum of
// its own — a caller reads `loading.status` (`WorldEncounterMaterialLoadStatus`,
// 0.9.21) and `verification.status` (`WorldEncounterMaterialVerificationStatus`,
// 0.9.37) exactly as those two files already define them, unchanged.
//
// NO CACHING, NO RETRY, NO FALLBACK, NO RANKING. Every call to
// `inspectWorldEncounterMaterial()` calls its one chosen loading boundary
// once and the verification boundary once, fresh, for exactly the one
// `resolvedSelection`/`resolvedLead` pair supplied — inherited unchanged
// from every file in this chain. This file never resolves an ambiguous
// selection (it accepts only an already-resolved one — see
// `application/WorldEncounterSelectionOutcome.js`, 0.9.20, for that step),
// never chooses among multiple decentralized backends, and never prefers
// one source over another.
//
// A THROWN REJECTION IS NEVER SWALLOWED. A rejected `loadWorldEncounterMaterial()`/
// `loadWorldEncounterMaterialFromResolvedLead()` promise propagates before
// `verifyWorldEncounterMaterial()` is ever called (the `await` below throws
// synchronously into this function's own caller); a rejected
// `verifyWorldEncounterMaterial()` promise propagates the same way. Neither
// is caught and translated into a result here.
//
// SYNCHRONOUS ROUTING DECISION, ASYNCHRONOUS RESULT — inherited from every
// loading/verification boundary in this chain. This file performs no I/O of
// its own; every byte of actual work happens inside whichever boundaries it
// calls.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Resolving an ambiguous selection, or choosing among several
//   candidates/leads.** This file accepts only an already-resolved
//   `resolvedSelection`; see `application/WorldEncounterSelectionOutcome.js`
//   (0.9.20) for that separate, earlier step.
// - **Resolving a decentralized lead from a selection.** A caller already
//   holds `resolvedLead`, from `application/
//   DecentralizedWorldEncounterLeadResolution.js` (0.9.28), before calling
//   this file.
// - **Constructing, injecting a default for, or choosing among
//   `materialSources.local`/`.peer`/`.decentralized`, or a default
//   `verifier`.** Both are supplied by the caller, exactly as every loading/
//   verification boundary already requires.
// - **Any UI, panel, or rendering technology choice.** This file returns a
//   plain, frozen, orchestration-shaped object; rendering it is separate
//   work — `ui/components/WorldEncounterCanvas.js` (this same milestone).
// - **Cryptographic signature verification, content-reference/URI
//   correspondence, trust, or ranking of any kind.** Unchanged from 0.9.37
//   and 0.9.38 — this file calls their existing boundary/verifier and adds
//   no judgment of its own.
// - **Caching, retrying, or falling back between the two loading
//   boundaries.** See "No caching, no retry, no fallback, no ranking,"
//   above.

// The one entry point a caller actually uses. Routes to whichever loading
// boundary matches whether `resolvedLead` was supplied (see this file's own
// header, "routing is decided by presence alone"), then hands the loaded
// material to `verifyWorldEncounterMaterial()` alongside the same
// `resolvedSelection`/`resolvedLead` — see this file's own header for
// exactly what each returned field means and what is deliberately excluded.
// Never throws for a missing/malformed `resolvedSelection` or `resolvedLead`
// (both underlying boundaries already degrade gracefully); a genuine
// rejection from either boundary propagates to this function's own caller
// unchanged.
export async function inspectWorldEncounterMaterial({ resolvedSelection, resolvedLead, materialSources, verifier } = {}) {
    const loading = resolvedLead
        ? await loadWorldEncounterMaterialFromResolvedLead({ resolvedSelection, resolvedLead, materialSources })
        : await loadWorldEncounterMaterial({ resolvedSelection, materialSources });

    const verification = await verifyWorldEncounterMaterial({
        resolvedSelection,
        resolvedLead: resolvedLead || null,
        material: loading.material,
        verifier
    });

    return Object.freeze({
        selection: resolvedSelection || null,
        lead: resolvedLead || null,
        loading,
        verification
    });
}
