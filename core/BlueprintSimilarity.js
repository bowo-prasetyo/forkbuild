import { canonicalizeBlueprint, deriveBlueprintFingerprint, blueprintFingerprintsEqual } from './BlueprintFingerprint.js';

// 0.6.8 — Blueprint Lineage & Revision Discovery.
//
// core/BlueprintFingerprint.js answers exact equality: "is this the same
// design content, byte for byte?" This module answers the different,
// softer question that sits between two independent fingerprints:
//
//   A == B    ->  core/BlueprintFingerprint.js#blueprintFingerprintsEqual()
//   A ~= B    ->  THIS FILE — how much do two DIFFERENT designs resemble
//                 each other?
//   A -> B    ->  core/BlueprintLineageClaim.js — a signed human assertion
//                 that B was derived from A
//
// Those are three genuinely different relationships, and this module is
// deliberately the only one of the three that computes anything. It never
// signs, never persists, never touches identity, and — critically — never
// itself decides that one blueprint was derived from another. It produces
// EVIDENCE a human (or a UI surfacing a "possible predecessor" suggestion)
// can weigh; the decision to actually assert lineage belongs entirely to
// core/BlueprintLineageClaim.js. See docs/Principles.md, "Similarity Is
// Evidence; It Never Becomes Lineage (0.6.8)" — the direct one-domain-over
// descendant of 0.5.4's own "Geographic Similarity Suggests Identity; It
// Never Mutates Identity."
//
// ---- What is compared, and how -----------------------------------------
//
// Reuses core/BlueprintFingerprint.js#canonicalizeBlueprint() rather than
// re-deriving canonical brick content itself — the exact same order-
// independent, id-independent, floating-point-tolerant brick shape
// fingerprinting already relies on, so "two bricks compare as the same
// brick" means exactly one thing everywhere in this codebase.
//
// Every brick is reduced to two keys:
//   - a POSITION key (x|y|z only) — "is something built in this exact
//     spot in both designs?"
//   - a FULL key (x|y|z|rotation|definitionId) — "is it the SAME brick,
//     unchanged, in both designs?"
//
// Comparing by DISTINCT position (a Set, not a multiset) is a deliberate
// simplification: two bricks stacked at the exact same (x,y,z) — already
// an unusual case in this engine — count as one occupied slot for
// overlap purposes. This module is producing evidence for a human to
// weigh, not a precise diff; see this file's own header above.
//
// ---- The five evidence numbers ------------------------------------------
//
//   positionOverlap  — of every distinct position occupied in EITHER
//                       design, the fraction occupied in BOTH. Answers
//                       "how much of the footprint lines up?"
//   brickOverlap     — of every distinct (position+rotation+definition)
//                       in EITHER design, the fraction identical in BOTH.
//                       Always <= positionOverlap: a position can line up
//                       while the brick sitting there changed.
//   changedBricks     — positions occupied in BOTH designs, where the
//                       brick actually sitting there differs (moved-in-
//                       place, re-rotated, or re-defined).
//   addedBricks       — positions occupied only in the candidate.
//   removedBricks     — positions occupied only in the source.
//   similarity        — a single, transparently-computed number for
//                       sorting/thresholding: the plain average of
//                       positionOverlap and brickOverlap. Deliberately
//                       not a fitted or weighted model — see this file's
//                       own header on why this stays a simple, legible
//                       heuristic rather than a black box.
//
// A design compared against itself (or an independently-authored,
// content-identical copy) always reports `identical: true` and every
// ratio at 1 — but see isPossibleLineageCandidate() below for why an
// identical pair is never itself offered as a lineage suggestion.
function positionKey(brick) {
    return `${brick.position.x}|${brick.position.y}|${brick.position.z}`;
}

function fullKey(brick) {
    return `${positionKey(brick)}|${brick.rotation}|${brick.definitionId}`;
}

function ratio(matchCount, unionSize) {
    if (unionSize === 0) {
        return 1; // two designs with zero bricks in this dimension are trivially identical in it
    }
    return matchCount / unionSize;
}

function round2(value) {
    return Math.round(value * 100) / 100;
}

// Pure. Returns null when either argument has no derivable design content
// (mirrors core/BlueprintFingerprint.js#canonicalizeBlueprint()'s own
// null-safety) rather than throwing — a caller scanning a whole library
// for candidates should never have one malformed entry abort the scan.
export function compareBlueprintSimilarity(sourceStructure, candidateStructure) {
    const sourceCanonical = canonicalizeBlueprint(sourceStructure);
    const candidateCanonical = canonicalizeBlueprint(candidateStructure);
    if (!sourceCanonical || !candidateCanonical) {
        return null;
    }

    const sourceByPos = new Map(sourceCanonical.bricks.map((b) => [positionKey(b), fullKey(b)]));
    const candidateByPos = new Map(candidateCanonical.bricks.map((b) => [positionKey(b), fullKey(b)]));

    const sourcePositions = new Set(sourceByPos.keys());
    const candidatePositions = new Set(candidateByPos.keys());
    const unionPositions = new Set([...sourcePositions, ...candidatePositions]);
    const sharedPositions = [...sourcePositions].filter((key) => candidatePositions.has(key));

    const sourceFullKeys = new Set(sourceByPos.values());
    const candidateFullKeys = new Set(candidateByPos.values());
    const unionFullKeys = new Set([...sourceFullKeys, ...candidateFullKeys]);
    const sharedFullKeys = [...sourceFullKeys].filter((key) => candidateFullKeys.has(key));

    let changedBricks = 0;
    for (const key of sharedPositions) {
        if (sourceByPos.get(key) !== candidateByPos.get(key)) {
            changedBricks += 1;
        }
    }
    const addedBricks = candidatePositions.size - sharedPositions.length;
    const removedBricks = sourcePositions.size - sharedPositions.length;

    const positionOverlap = ratio(sharedPositions.length, unionPositions.size);
    const brickOverlap = ratio(sharedFullKeys.length, unionFullKeys.size);
    const similarity = round2((positionOverlap + brickOverlap) / 2);

    const sourceFingerprint = deriveBlueprintFingerprint(sourceStructure);
    const candidateFingerprint = deriveBlueprintFingerprint(candidateStructure);

    return {
        sourceFingerprint,
        candidateFingerprint,
        identical: blueprintFingerprintsEqual(sourceFingerprint, candidateFingerprint),
        positionOverlap,
        brickOverlap,
        changedBricks,
        addedBricks,
        removedBricks,
        similarity
    };
}

// The default cutoff a UI uses to decide whether a candidate is even
// worth surfacing as a "possible predecessor" suggestion — never a
// cutoff for anything this module persists or asserts itself. Exported
// so a UI and its own tests read the exact same number rather than two
// independently-typed copies of "0.5" drifting apart over time.
export const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

// True iff `evidence` is similar enough to be worth showing a human as a
// candidate — and NOT the identical design already, since "these two are
// literally the same design" is a fingerprint match
// (core/BlueprintFingerprint.js), never a lineage suggestion. Purely a
// presentation filter: it decides what gets SHOWN, never what gets
// CLAIMED — see this file's own header on why only core/
// BlueprintLineageClaim.js is ever allowed to assert lineage.
export function isPossibleLineageCandidate(evidence, threshold = DEFAULT_SIMILARITY_THRESHOLD) {
    return !!evidence && !evidence.identical && evidence.similarity >= threshold;
}

// A short, human-readable summary for display — e.g. "86% design
// similarity" — never a stored or signed fact, the same presentation-
// only posture core/BlueprintFingerprint.js#describeBlueprintFingerprint()
// already keeps.
export function describeBlueprintSimilarity(evidence) {
    if (!evidence) {
        return '';
    }
    if (evidence.identical) {
        return 'Identical design';
    }
    return `${Math.round(evidence.similarity * 100)}% design similarity`;
}
