import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { reconstructPublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from './PublisherLeaderboardSnapshotFingerprint.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';

// 0.8.121 — Signed Reproducible Leaderboard Snapshot Claim: creation.
//
// THE ONE, EXPLICIT CONSTRUCTION BOUNDARY — A CLAIM IS NEVER CREATED ANY
// OTHER WAY. Every `core/PublisherLeaderboardSnapshotClaim.js` this
// codebase ever produces locally is produced by `execute()` below, the
// same explicit-reference discipline 0.8.104 already established for
// publication references and every REQUIRED-signature claim family since
// (`application/PlaceNamingClaimUseCase.js#publish()`,
// `application/BlueprintAttributionUseCase.js`,
// `application/BlueprintLineageClaimUseCase.js`). Nothing about the
// achievement pipeline, the ranking policy, or the leaderboard projection
// ever reaches into this class and calls it automatically — see this
// milestone's own design note, "signing is an explicit action," in
// `docs/Roadmap.md`.
//
// SIGNING IS NEVER AUTOMATIC — THE MOST IMPORTANT RESTRAINT THIS FILE
// HOLDS. `application/PublisherLeaderboardSnapshot.js` (0.8.119) and
// `application/PublisherLeaderboardSnapshotVerification.js` (0.8.120) are
// projections — they run every time anything asks a question, silently,
// with no observable trace. A signed claim is the opposite: a durable,
// attributable, cryptographically binding STATEMENT that some identity
// deliberately chose to make. Recomputing a leaderboard on every
// evidence change and AUTOMATICALLY re-signing a new claim about it would
// blur computation with endorsement — a change nobody asked for would
// silently manufacture what looks like a fresh human/agent assertion.
// `execute()` below is called once, deliberately, exactly when a caller
// (a person, or an agent acting on a person's explicit behalf) decides to
// vouch for the leaderboard their own replica currently computes — never
// as a side effect of anything else in this codebase.
//
// THE SIGNING IDENTITY IS A did:key, NEVER A `PublisherIdentityRecord`.
// `signerIdentityId` below comes exclusively from `resolveSigningIdentityId()`
// (identity/resolveSigningIdentityId.js, UNCHANGED) — the cryptographic
// identity currently authenticated on `identityProvider` — and this file
// imports nothing from `application/PublisherIdentityRecord.js`. See
// core/PublisherLeaderboardSnapshotClaim.js's own header, "Do not use
// PublisherIdentityRecord as the signer," for the full rationale: a
// publisher label and a signing key are two different kinds of identity,
// and this class never lets one silently stand in for the other.
//
// WHAT GETS SIGNED IS THIS REPLICA'S OWN CURRENT SNAPSHOT — NEVER A
// CALLER-SUPPLIED ONE. `execute(archive)` reconstructs a fresh
// `PublisherLeaderboardSnapshot` straight from `archive` via
// `reconstructPublisherLeaderboardSnapshot()` (0.8.119, UNCHANGED) —
// there is no parameter through which a caller could hand this class a
// snapshot to sign unseen. Signing is always "I attest to what MY OWN
// evidence and policy currently produce," never "I attest to whatever
// you handed me."
//
// VERIFIES ITS OWN OUTPUT BEFORE RETURNING IT — THE IDENTICAL DISCIPLINE
// `application/PlaceNamingClaimUseCase.js#publish()` ALREADY HOLDS. A
// freshly signed claim is run back through
// `verifier.verifyPublisherLeaderboardSnapshotClaim()`
// (identity/LocalAuthorizationVerifier.js) before `execute()` ever
// returns it; a failure here means the identityProvider and verifier
// disagree about the signing domain/algorithm, never a normal runtime
// outcome.
//
// NO PERSISTENCE — DELIBERATELY OUT OF SCOPE FOR THIS MILESTONE, NOT
// MERELY OMITTED. `execute()` returns a signed
// `PublisherLeaderboardSnapshotClaim`; it never calls `.save()` on
// anything, never touches `application/PublicationObservationArchive.js`
// (no new collection, no `SCHEMA_VERSION` bump), and never persists to
// any store. This is a genuinely large, separately sized question — a
// durable claim archive needs its own provenance tracking,
// fingerprinting, export/import, difference detection, and
// replacement-review integration, following the exact machinery every
// other durable collection in this codebase already earned one milestone
// at a time (0.8.82 through 0.8.90, for the archive itself) — never
// bolted on as a side effect of the signing primitive landing. See
// `docs/Roadmap.md`, 0.8.121, "What's left."
export class CreatePublisherLeaderboardSnapshotClaimUseCase {
    constructor(identityProvider, verifier) {
        if (!identityProvider) {
            throw new Error('CreatePublisherLeaderboardSnapshotClaimUseCase: identityProvider is required');
        }
        if (!verifier || typeof verifier.verifyPublisherLeaderboardSnapshotClaim !== 'function') {
            throw new Error('CreatePublisherLeaderboardSnapshotClaimUseCase: an authorization verifier capable of verifyPublisherLeaderboardSnapshotClaim is required');
        }
        this._identityProvider = identityProvider;
        this._verifier = verifier;
    }

    // Signs and returns a new claim: "I, the currently authenticated
    // identity, assert this exact leaderboard snapshot — reconstructed,
    // right now, from `archive` — is the one my evidence and policy
    // produce." Throws if nobody is signed in, or if the identityProvider
    // lacks the 0.2.16 cryptographic surface.
    execute(archive) {
        const signerIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!signerIdentityId) {
            throw new Error('CreatePublisherLeaderboardSnapshotClaimUseCase: sign in to create a leaderboard snapshot claim');
        }
        if (typeof this._identityProvider.signCanonical !== 'function') {
            throw new Error('CreatePublisherLeaderboardSnapshotClaimUseCase: this identity provider cannot sign a leaderboard snapshot claim');
        }

        const snapshot = reconstructPublisherLeaderboardSnapshot(archive);
        const { fingerprint: snapshotFingerprint } = describePublisherLeaderboardSnapshotFingerprint(snapshot);

        let claim = new PublisherLeaderboardSnapshotClaim({
            evidenceFingerprint: snapshot.evidenceFingerprint,
            policyVersion: snapshot.policy.version,
            snapshotFingerprint,
            signerIdentityId
        });
        const signature = this._identityProvider.signCanonical(claim.getSigningDescriptor());
        claim = claim.withSignature(signature);

        const result = this._verifier.verifyPublisherLeaderboardSnapshotClaim(claim.toJSON());
        if (!result.valid) {
            throw new Error(`CreatePublisherLeaderboardSnapshotClaimUseCase: refusing to return an unverifiable claim — ${result.reason}`);
        }
        return claim;
    }
}
