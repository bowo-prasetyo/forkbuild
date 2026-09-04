import { computeContentHash } from '../serializer/contentHash.js';
import { DecentralizedSnapshotResolutionOutcome } from './DecentralizedSnapshotResolutionOutcome.js';
import { SnapshotPublicationAttributionOutcome } from './SnapshotPublicationAttributionOutcome.js';

// 0.9.143 — Snapshot–Publication Attribution.
//
// application/DiscoverSnapshotCommand.js (0.9.142) answered Q1+Q2 of that
// milestone's own three-question split:
//
//   Q1: What Snapshot locations have been announced?     DISCOVERY
//   Q2: Can one of those locations provide valid bytes?  RESOLUTION + VERIFICATION
//   Q3: Does this verified Snapshot belong to this
//       Publication?                                     ATTRIBUTION  ★ (THIS)
//
// This file is Q3, and nothing more — the single seam 0.9.142's own
// header named and deliberately left unbuilt ("Snapshot–Publication
// attribution of any kind... a separate, later, unscheduled milestone").
//
//   Publication.contentReference.hash
//                │
//                │ compare
//                ▼
//   verified Snapshot content hash
//   (recomputed from resolvedSnapshot.bytes, never trusted from a
//   candidate's own self-declared, unverified contentHash)
//                │
//                ▼
//         MATCH / NO_MATCH
//
// A PURE FUNCTION — NO I/O, NO KNOWLEDGE OF DISCOVERY INFRASTRUCTURE.
// `resolveSnapshotPublicationAttribution()` performs no network access, no
// storage access, and no discovery of its own. It never imports Nostr,
// Arweave, `DecentralizedSnapshotResolver`, a content store, a store
// registry, World View, or any UI state. It receives two already-computed
// facts — a Publication and an already-resolved Snapshot result — and
// compares them. Given the same two inputs, it always returns the same
// result; neither input is ever mutated.
//
// ATTRIBUTION REQUIRES AN ALREADY-VERIFIED SNAPSHOT — THE MOST IMPORTANT
// RULE THIS FILE HOLDS. `resolvedSnapshot` is expected to be exactly the
// `{ outcome, bytes, candidates, locator, storage, reason }` shape
// `application/DecentralizedSnapshotResolver.js#resolve()` (equivalently
// `application/DiscoverSnapshotCommand.js#executeDiscoverSnapshotCommand()`)
// itself resolves to. When `resolvedSnapshot.outcome` is anything other
// than `DecentralizedSnapshotResolutionOutcome.RESOLVED`, this function
// NEVER reports `NO_MATCH` — it passes that same resolution-failure
// outcome (and its own `reason`) through unchanged. Discovery having
// announced a locator, or a store having been queried, is never enough on
// its own to produce an attribution verdict — only bytes that already
// passed `resolve()`'s own hash verification are ever compared here. See
// application/SnapshotPublicationAttributionOutcome.js's own header for
// why that failure vocabulary is never folded into NO_MATCH.
//
// COMPARES CONTENT IDENTITY, NEVER A LOCATOR. The verified Snapshot's own
// content hash is RECOMPUTED from `resolvedSnapshot.bytes` via
// `computeContentHash()` — the identical function `core/
// ContentReference.js#verify()` already uses — rather than read off
// `resolvedSnapshot.candidates[0].contentHash` or any other
// self-declared, unverified field. This matters precisely when a caller
// resolved `resolvedSnapshot` against some OTHER contentHash (a different
// Publication, or a bare exploratory lookup) and is now asking whether
// that already-verified Snapshot also happens to belong to THIS
// Publication — the comparison must hold even when the two hashes
// differ, which a comparison against `resolvedSnapshot`'s own request
// parameters could never expose. `publication.id`, an Arweave transaction
// id, a Nostr event id, and `resolvedSnapshot.locator` are never
// meaningful inputs to this comparison — only the two content hashes are.
//
// NEVER REDISCOVERS. This file calls no `resolver.resolve()` of its own
// and performs no query, retrieval, or verification a caller hasn't
// already done. The composition this milestone establishes is:
//
//   resolver.resolve(...)  (0.9.134, unmodified)
//           │
//           ▼
//   resolvedSnapshot
//           │
//           ▼
//   resolveSnapshotPublicationAttribution(publication, resolvedSnapshot)   (THIS FILE)
//
// never the reverse — this file is never handed a bare Publication and
// left to go discover a Snapshot for it itself.
//
// DUCK-TYPED, NEVER `instanceof`. `publication` is accepted as anything
// exposing a `contentReference.hash` string — a real `publisher/
// Publication.js` instance or a plain object shaped the same way — the
// identical restraint every sibling collaborator in this family already
// holds for its own required argument.
//
// THROWS ONLY FOR A CALLER CONTRACT VIOLATION — A MISSING/MALFORMED
// ARGUMENT — NEVER FOR A MISMATCH OR A RESOLUTION FAILURE. Both of those
// are ordinary, expected results, reported as a value, never as a thrown
// error, exactly the restraint `application/DecentralizedSnapshotResolver.js#resolve()`
// already holds for its own failures.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any lifecycle, trust, or ownership vocabulary** — `TRUSTED`,
//   `AUTHENTIC`, `OWNED`, `CONFIRMED`, `PUBLISHED`, `CANONICAL`. Only
//   `MATCH`/`NO_MATCH` (application/SnapshotPublicationAttributionOutcome.js)
//   plus `DecentralizedSnapshotResolutionOutcome`'s own four failure
//   values are ever returned.
// - **A UI badge or any composition-root wiring.** This file has no idea
//   `ui/` or World View exists.
// - **Retry, caching, ranking, or re-resolution of any kind.** A caller
//   who wants a fresh `resolvedSnapshot` calls `resolver.resolve()` again,
//   itself, before calling this file again.

// resolveSnapshotPublicationAttribution(publication, resolvedSnapshot) ->
//   { outcome, publicationHash, snapshotHash, reason }
//
// `publication`      — anything exposing `contentReference.hash` (a
//                       string). Required.
// `resolvedSnapshot`  — the `{ outcome, bytes, candidates, locator,
//                       storage, reason }` result of `resolver.resolve()`
//                       (0.9.134) or `executeDiscoverSnapshotCommand()`
//                       (0.9.142). Required.
//
// When `resolvedSnapshot.outcome !== DecentralizedSnapshotResolutionOutcome.RESOLVED`:
//   returns `{ outcome: resolvedSnapshot.outcome, publicationHash,
//   snapshotHash: null, reason: resolvedSnapshot.reason }` — the
//   resolution's own failure reported unchanged, never `NO_MATCH`.
//
// When RESOLVED: recomputes the verified Snapshot's own content hash from
// `resolvedSnapshot.bytes` and compares it against
// `publication.contentReference.hash`, returning
// `SnapshotPublicationAttributionOutcome.MATCH` or `.NO_MATCH`
// accordingly, alongside both hashes for a caller that wants to display
// them.
export function resolveSnapshotPublicationAttribution(publication, resolvedSnapshot) {
    if (!publication || !publication.contentReference || typeof publication.contentReference.hash !== 'string') {
        throw new Error('resolveSnapshotPublicationAttribution: a publication with a contentReference.hash is required');
    }
    if (!resolvedSnapshot || typeof resolvedSnapshot.outcome !== 'string') {
        throw new Error('resolveSnapshotPublicationAttribution: a resolvedSnapshot with an outcome is required');
    }

    const publicationHash = publication.contentReference.hash;

    if (resolvedSnapshot.outcome !== DecentralizedSnapshotResolutionOutcome.RESOLVED) {
        return {
            outcome: resolvedSnapshot.outcome,
            publicationHash,
            snapshotHash: null,
            reason: resolvedSnapshot.reason
        };
    }

    const bytes = resolvedSnapshot.bytes;
    const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
    const snapshotHash = computeContentHash(text);

    return {
        outcome: snapshotHash === publicationHash
            ? SnapshotPublicationAttributionOutcome.MATCH
            : SnapshotPublicationAttributionOutcome.NO_MATCH,
        publicationHash,
        snapshotHash,
        reason: null
    };
}
