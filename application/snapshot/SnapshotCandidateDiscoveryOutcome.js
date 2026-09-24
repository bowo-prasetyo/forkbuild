// 0.9.589 — Distinguish Snapshot Discovery Absence from Discovery
// Failure.
//
// application/nostr/NostrSnapshotDiscoveryQueryService.js#search() (0.9.133,
// UNMODIFIED by this milestone) and application/
// SnapshotCandidateDiscoveryQueryService.js#search() (0.9.485, UNMODIFIED
// by this milestone) both degrade EVERY failure — a rejected/timed-out
// queryImpl, a malformed response, a source that throws — to the exact
// same `[]` a genuine "nothing has been announced" result also produces.
// That collapse is deliberate at the transport boundary (see each file's
// own header, "never throws... every failure degrades to []") but it
// throws away a real distinction `ui/components/OwnPublicationPanel.js`
// needs in order to describe what happened honestly: "nobody has
// announced a Snapshot" and "the discovery query could not be completed"
// are different facts, and only the second one is a degradation worth
// naming to a person.
//
// THIS FILE NAMES THE DISTINCTION; IT DOES NOT COMPUTE IT. Each
// producer's own `searchWithOutcome()` sibling method (added by this
// milestone alongside its existing, UNMODIFIED `search()`) is solely
// responsible for classifying its own result into one of these three
// values — see that method's own header for the classification rule.
export const SnapshotCandidateDiscoveryOutcome = Object.freeze({
    // The search completed and found at least one candidate.
    FOUND: 'found',
    // The search completed — every source that was actually asked
    // answered — and genuinely found nothing. Never reported when no
    // source could be asked at all; see UNAVAILABLE.
    EMPTY: 'empty',
    // The search could not be completed — a transport failure, a
    // timeout, a malformed response, or (for a composite source) every
    // constituent source failing the same way. NEVER a verdict that
    // nothing has been announced; only that nothing could be learned
    // this time.
    UNAVAILABLE: 'unavailable'
});
