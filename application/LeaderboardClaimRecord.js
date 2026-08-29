import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { PublicationObservationArchiveProvenanceOrigin, isValidPublicationObservationArchiveProvenanceOrigin } from './PublicationObservationArchiveProvenance.js';

// 0.8.123 — Signed Leaderboard Claim Archive: the durable receipt.
//
// 0.8.121 proved a signing identity can make a durable, attributable
// statement about a reproducible leaderboard conclusion. 0.8.122 proved
// that statement can travel between two replicas as a small, closed JSON
// payload, and land on the far side as a genuine, structurally verified
// `PublisherLeaderboardSnapshotClaim` — without ever being written down
// anywhere. Neither one ever answered what a replica does the MOMENT
// AFTER it receives one: there was no durable place to put it, and no way
// to look back at what has arrived over time. This class is that place —
// a single received claim, and the two facts a replica can honestly add
// on top of it:
//
//   PublisherLeaderboardSnapshotClaim (0.8.121, UNCHANGED — signed, closed)
//                    +
//   receivedAt   — when THIS replica's own clock saw it
//   origin       — how it entered THIS replica's own history
//                    ↓
//            LeaderboardClaimRecord
//
// THE CLAIM ITSELF NEVER CHANGES SHAPE — THE ONE RULE THIS FILE EXISTS TO
// ENFORCE. `claim` is carried through UNCHANGED, the exact
// `PublisherLeaderboardSnapshotClaim` instance a caller already holds
// (typically the one `application/PublisherLeaderboardSnapshotClaimExchange.js#importPublisherLeaderboardSnapshotClaim()`
// just handed back) — never copied field-by-field into a new shape, never
// re-signed, never re-verified a second time by this class. `receivedAt`
// and `origin` describe THIS REPLICA'S OWN INGESTION of that artifact —
// they are facts about the receiving, not facts the claim itself asserts,
// and they are never merged into the claim's own JSON or allowed to
// influence what `claim.toJSON()` produces.
//
// `origin` REUSES `application/PublicationObservationArchiveProvenance.js`
// (0.8.83) RATHER THAN INVENTING A SECOND PROVENANCE VOCABULARY. A claim
// this replica itself signed (via `application/CreatePublisherLeaderboardSnapshotClaimUseCase.js`)
// and chooses to keep alongside the ones it received is `LOCAL`; a claim
// that arrived through `application/PublisherLeaderboardSnapshotClaimExchange.js`'s
// own import is `IMPORTED` — the identical two-value, no-more-than-two-
// values restraint 0.8.83 already established for a whole archive's own
// facts, held here once more, one layer up, over a signed conclusion
// instead of a raw one. See that file's own header, "This Is Not A Trust
// Score" — the identical restraint applies here without qualification:
// `LOCAL` is not "more trustworthy" than `IMPORTED`, it is only a
// different route into this replica's own history.
//
// A RECEIPT, NEVER A VERDICT. This class carries no `trusted`, `valid`,
// `current`, `authoritative`, `verified`, `score`, `reputation`, or
// `rank` field, and never will — the identical vocabulary boundary every
// file in the achievement/leaderboard/claim family already holds (see
// `core/PublisherLeaderboardSnapshotClaim.js`'s own header,
// "Deliberately Non-Evaluative"). Recording that a claim arrived says
// nothing about whether it is true, current, or should be preferred over
// any other claim on file — that is exactly, and only,
// `application/PublisherLeaderboardSnapshotClaimVerification.js`'s own
// job (0.8.121, UNCHANGED), run by a caller as its own, separate,
// explicit step against this replica's own archive, whenever it chooses
// to ask.
//
// A SIGNED CLAIM ONLY — REFUSES TO RECORD AN UNSIGNED ONE, THE IDENTICAL
// REFUSAL `application/PublisherLeaderboardSnapshotClaimExchange.js#exportPublisherLeaderboardSnapshotClaim()`
// ALREADY MAKES ONE LAYER OVER. A receipt about a claim nobody signed
// would not be a receipt of an attributable statement at all.
//
// IMMUTABLE, LIKE EVERY OTHER DURABLE RELATIONSHIP RECORD IN THIS
// CODEBASE (`application/PublicationReferenceRecord.js`,
// `application/PublisherPublicationAssociationRecord.js`). Every field is
// validated once, at construction, and frozen; there is no setter, no
// wither, and no way to produce a "corrected" record other than minting
// an entirely new one — a correction is a new receipt, never a mutation
// of an old one's own history.
export class LeaderboardClaimRecord {
    constructor({ claim, receivedAt = new Date(), origin = PublicationObservationArchiveProvenanceOrigin.IMPORTED } = {}) {
        if (!(claim instanceof PublisherLeaderboardSnapshotClaim)) {
            throw new Error('LeaderboardClaimRecord requires a genuine PublisherLeaderboardSnapshotClaim for claim');
        }
        if (!claim.signature) {
            throw new Error('LeaderboardClaimRecord refuses to record an unsigned leaderboard snapshot claim');
        }
        const receivedAtDate = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
        if (Number.isNaN(receivedAtDate.getTime())) {
            throw new Error('LeaderboardClaimRecord: receivedAt must be a valid date');
        }
        if (!isValidPublicationObservationArchiveProvenanceOrigin(origin)) {
            throw new Error('LeaderboardClaimRecord requires a valid provenance origin (local or imported)');
        }
        this._claim = claim;
        this._receivedAt = receivedAtDate;
        this._origin = origin;
        Object.freeze(this);
    }

    get claim() { return this._claim; }
    get receivedAt() { return this._receivedAt; }
    get origin() { return this._origin; }

    toJSON() {
        return {
            claim: this._claim.toJSON(),
            receivedAt: this._receivedAt.toISOString(),
            origin: this._origin
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        // 0.8.130 — `PublisherLeaderboardSnapshotClaim.fromJSON()` (core,
        // UNCHANGED) throws when `json.claim` is PRESENT but structurally
        // incomplete (e.g. missing `evidenceFingerprint`) — its own
        // constructor's validation, not a null-safe parse. Before archive
        // integration this method was only ever exercised on already-valid
        // data (never fed genuinely untrusted JSON), so that throw was
        // unreachable in practice. application/PublicationObservationArchive.js's
        // own `fromJSON()` (0.8.130) now feeds this method exactly that —
        // a possibly-corrupted archive payload — so both calls that can
        // throw on malformed input belong inside the SAME try/catch,
        // exactly like every other `fromJSON()` in this codebase's own
        // "malformed input degrades to null, never a throw" contract.
        try {
            const claim = PublisherLeaderboardSnapshotClaim.fromJSON(json.claim);
            if (!claim) return null;
            return new LeaderboardClaimRecord({ claim, receivedAt: json.receivedAt, origin: json.origin });
        } catch {
            return null;
        }
    }
}
