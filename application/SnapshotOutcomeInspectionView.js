import { DecentralizedSnapshotResolutionOutcome } from './DecentralizedSnapshotResolutionOutcome.js';

// 0.9.528 — Snapshot Encounter & Placement Product Experience
// Reassessment, Section C/I.
//
// application/WorldEncounterMaterialInspectionView.js (0.9.519) closed one
// concrete instance of a codebase-wide discipline — never render a bare
// application/ outcome enum directly to a Wanderer — for the World
// Encounter Material/Verification panel. That same discipline had not yet
// reached the Snapshot Discovery/Resolution/Attribution family:
// ui/components/OwnPublicationPanel.js and ui/components/
// WorldEncounterCanvas.js each rendered `snapshotDiscoveryResult.outcome`,
// `selectedSnapshotResolutionResult.outcome`, `snapshotAttributionResult
// .outcome`, and `selectedSnapshotAttributionResult.outcome` verbatim —
// the literal machine words 'resolved', 'not-discovered',
// 'store-unavailable', 'content-unavailable', 'content-hash-mismatch',
// 'match', and 'no-match' displayed as-is. This file is the missing view,
// mirroring application/WorldEncounterMaterialInspectionView.js's own
// shape exactly, and only that: no outcome semantics, reset behavior, or
// call site anywhere in the pipeline changes.
//
// TWO SEPARATE ENUMS, TWO SEPARATE FUNCTIONS, NEVER MERGED. application/
// DecentralizedSnapshotResolutionOutcome.js answers "was this content
// retrieved and hash-verified?" (discovery/location/retrieval/
// verification); application/SnapshotPublicationAttributionOutcome.js
// answers a narrower, later question reachable only once that retrieval
// already succeeded — "does the already-verified Snapshot's own hash equal
// THIS Publication's own contentReference.hash?" Folding the two into one
// label table would blur exactly the distinction application/
// SnapshotPublicationAttribution.js's own header holds ("Q2 vs Q3").
// `describeSnapshotAttributionOutcomeLabel()` delegates to
// `describeSnapshotResolutionOutcomeLabel()` for the resolution-failure
// values `resolveSnapshotPublicationAttribution()` passes through
// unchanged (see that file's own header, "a resolution failure is never
// reported as NO_MATCH") — the identical failure, described once, never
// two different sentences for the same fact depending which panel it
// surfaces in.
//
// NEVER IMPORTS application/SnapshotPublicationAttributionOutcome.js.
// tests/SnapshotLifecycleSemanticBoundaryAudit.js's own Section G holds a
// deliberate, repository-wide rule: application/
// SnapshotPublicationAttribution.js remains the ONLY file that ever
// references that enum — every other consumer reads an already-computed
// `.outcome` string, never imports the vocabulary to manufacture or match
// against a value of its own. This file's ATTRIBUTION_OUTCOME_LABELS map
// therefore uses the two values' own literal strings ('match'/'no-match')
// directly, not the enum's own named members, exactly like every OTHER
// non-defining consumer in this codebase already does for this
// particular enum. (application/DecentralizedSnapshotResolutionOutcome.js
// carries no equivalent single-authority restriction, so
// RESOLUTION_OUTCOME_LABELS below keys off that enum's own members
// normally.)
//
// "CONFIRMED TO MATCH," NEVER A STRONGER WORD, AND NEVER THE BARE ENUM
// WORD ON ITS OWN. A MATCH means only that two independently-computed
// content hashes are equal — never authorship, ownership, or that the
// Publication itself deserves confidence beyond that one fact (see that
// enum's own defining file's header, "only the two content hashes are"
// meaningful here). The label below deliberately echoes application/
// WorldEncounterMaterialInspectionView.js's own VERIFIED label ("Confirmed
// to match the selected encounter") for the identical reason: the same
// underlying evidence — a hash equality check — should read the same way
// everywhere it is shown, never a stronger claim in one panel than
// another. See docs/Principles.md, "Known Evidence Is Not Verified
// Evidence, And Verified Evidence Is Not Authority (0.8.3)."
//
// PURE AND READ-ONLY, MIRRORING EVERY VIEW FILE IN THIS FAMILY. No network
// access, no mutation, no history of its own. An unrecognized outcome (there
// is none today) falls through to the raw value itself, never a fabricated
// label — the identical degrade-to-raw-value discipline application/
// WorldEncounterMaterialInspectionView.js's own label maps already hold.
const RESOLUTION_OUTCOME_LABELS = {
    [DecentralizedSnapshotResolutionOutcome.RESOLVED]: 'Retrieved — content hash confirmed',
    [DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED]: 'Not currently announced by any known source',
    [DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE]: 'No content store available for the announced location',
    [DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE]: 'Could not retrieve content from the announced location',
    [DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH]: 'Retrieved content does not match the requested hash'
};

// The literal wire values application/SnapshotPublicationAttributionOutcome
// .js's own MATCH/NO_MATCH freeze — 'match'/'no-match' — copied here as
// plain strings rather than imported, per this file's own header above.
const ATTRIBUTION_OUTCOME_LABELS = {
    match: 'Confirmed to match this Publication',
    'no-match': 'Does not match this Publication'
};

// For `snapshotDiscoveryResult.outcome` and `selectedSnapshotResolutionResult
// .outcome` — application/DecentralizedSnapshotResolutionOutcome.js's own
// five values, describing what happened when ONE specific Snapshot
// location was retrieved and hash-checked. Never a verdict about whether
// the content exists at all (see that file's own header on
// NOT_DISCOVERED/CONTENT_UNAVAILABLE): only what THIS attempt observed.
export function describeSnapshotResolutionOutcomeLabel(outcome) {
    return RESOLUTION_OUTCOME_LABELS[outcome] || outcome || null;
}

// For `snapshotAttributionResult.outcome` and `selectedSnapshotAttributionResult
// .outcome` — either one of application/SnapshotPublicationAttributionOutcome
// .js's own two values (a resolution already succeeded, and the verified
// hash was compared against this Publication's own), or a resolution
// failure passed through unchanged from application/
// DecentralizedSnapshotResolutionOutcome.js (the resolution never reached a
// hash to compare in the first place). Both cases are described here so a
// caller never has to know which enum a given outcome string belongs to.
export function describeSnapshotAttributionOutcomeLabel(outcome) {
    return ATTRIBUTION_OUTCOME_LABELS[outcome] || describeSnapshotResolutionOutcomeLabel(outcome);
}
