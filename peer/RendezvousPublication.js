import { createId } from '../core/createId.js';
import { PeerInvitation } from './PeerInvitation.js';

// 0.2.65 — the ONE message shape the rendezvous protocol ever sends over
// PUBLISH or returns from LOOKUP: "here is where identityHint might be
// reachable, for a little while." A RendezvousPublication is nothing more
// than an ordinary peer/PeerInvitation.js — the same rendezvous hint 0.2.50
// already established, never a credential (see that file's own header) —
// plus the bookkeeping (`publicationId`, `publishedAt`) a rendezvous NODE
// needs to store and expire it. It carries no private key material and no
// claim of permanence: `identityHint` travels exactly as untrusted as it
// always has (peer/PeerDiscoveryRecord.js), and `expiresAt` is deliberately
// this publication's OWN clock, never longer-lived than the invitation it
// wraps — see `create()` below.
//
// A publication with no identityHint would be unpublishable in the first
// place: LOOKUP only ever works BY identity (see peer/RendezvousTransport.js),
// so an anonymous invitation has nothing to publish itself under and stays
// exactly what it always was — something relayed by hand, never through the
// rendezvous network.
//
// 0.2.66 adds one OPTIONAL field beyond what 0.2.65 shipped: `signature`,
// an Ed25519 signature (core/RendezvousPublicationEnvelope.js's own
// getRendezvousPublicationSigningDescriptor()) over the ENTIRE publication
// — never a credential, still: it proves "whoever holds identityHint's own
// private key produced this specific PUBLISH," nothing about who actually
// answers at `endpoint`. A publication with no signature is exactly as
// valid as it was in 0.2.65 — see peer/RendezvousPublicationSigning.js and
// identity/LocalAuthorizationVerifier.js#verifyRendezvousPublication for
// how it is produced and checked; this class itself has no opinion about
// either, and never refuses to construct an unsigned publication.
export const DEFAULT_PUBLICATION_TTL_MS = 5 * 60 * 1000; // deliberately shorter than PeerInvitation's own 10-minute default — see peer/RendezvousDiscoveryProvider.js's own header on why rendezvous entries stay short-lived

export class RendezvousPublication {
    constructor({ publicationId = createId(), invitation, publishedAt = new Date(), expiresAt, signature = null } = {}) {
        const parsed = invitation instanceof PeerInvitation ? invitation : PeerInvitation.fromJSON(invitation);
        if (!parsed.identityHint) {
            throw new Error('RendezvousPublication: an invitation published to the rendezvous network must carry an identityHint — otherwise nobody could ever LOOKUP it by identity');
        }
        const publishedAtDate = new Date(publishedAt);
        if (Number.isNaN(publishedAtDate.getTime())) {
            throw new Error('RendezvousPublication: publishedAt must be a valid date');
        }

        this._publicationId = publicationId;
        this._invitation = parsed;
        this._publishedAt = publishedAtDate;

        const requestedExpiry = expiresAt !== undefined && expiresAt !== null ? new Date(expiresAt) : parsed.expiresAt;
        if (Number.isNaN(requestedExpiry.getTime())) {
            throw new Error('RendezvousPublication: expiresAt must be a valid date');
        }
        // Never outlives the invitation it wraps, regardless of what ttl a
        // caller requested — a publication is only ever AS fresh as its
        // own rendezvous-layer ttl AND the underlying invitation, whichever
        // is stricter.
        this._expiresAt = requestedExpiry.getTime() < parsed.expiresAt.getTime() ? requestedExpiry : parsed.expiresAt;
        this._signature = signature || null;
    }

    get publicationId() { return this._publicationId; }
    get invitation() { return this._invitation; }
    get identityHint() { return this._invitation.identityHint; }
    get endpoint() { return this._invitation.endpoint; }
    get publishedAt() { return this._publishedAt; }
    get expiresAt() { return this._expiresAt; }
    get signature() { return this._signature; }

    isExpired(now = new Date()) {
        return now.getTime() >= this._expiresAt.getTime();
    }

    // 0.2.66 — returns a NEW RendezvousPublication, identical in every
    // other field, carrying `signature`. Never mutates this instance —
    // the same "signing produces a new object" discipline
    // application/PresenceSigning.js already established one layer up.
    // See peer/RendezvousPublicationSigning.js, the only caller.
    withSignature(signature) {
        return new RendezvousPublication({
            publicationId: this._publicationId,
            invitation: this._invitation,
            publishedAt: this._publishedAt,
            expiresAt: this._expiresAt,
            signature
        });
    }

    toJSON() {
        return {
            publicationId: this._publicationId,
            invitation: this._invitation.toJSON(),
            publishedAt: this._publishedAt.toISOString(),
            expiresAt: this._expiresAt.toISOString(),
            ...(this._signature ? { signature: this._signature } : {})
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            throw new Error('RendezvousPublication: cannot parse a publication from a non-object value');
        }
        if (!json.invitation) {
            throw new Error('RendezvousPublication: missing invitation');
        }
        return new RendezvousPublication({
            publicationId: json.publicationId,
            invitation: PeerInvitation.fromJSON(json.invitation),
            publishedAt: json.publishedAt,
            expiresAt: json.expiresAt,
            signature: json.signature || null
        });
    }

    // Alice's/Bob's side of PUBLISH: wraps an already-built peer/
    // PeerInvitation.js (see application/DiscoverPeersUseCase.js#createInvitation,
    // unmodified by this milestone) as a fresh, short-lived publication.
    static create({ invitation, ttlMs = DEFAULT_PUBLICATION_TTL_MS, now = new Date() } = {}) {
        const parsed = invitation instanceof PeerInvitation ? invitation : PeerInvitation.fromJSON(invitation);
        return new RendezvousPublication({
            invitation: parsed,
            publishedAt: now,
            expiresAt: new Date(now.getTime() + ttlMs)
        });
    }
}
