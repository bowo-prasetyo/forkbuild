import { EventBus } from '../core/events/EventBus.js';
import { WorldEditAuthority } from '../core/WorldEditAuthority.js';
import {
    toWorldEditAuthorizationGrant,
    getWorldEditAuthorizationGrantSigningDescriptor,
    toWorldEditAuthorizationRevocation,
    getWorldEditAuthorizationRevocationSigningDescriptor,
    isValidWorldEditAuthorizationGrant,
    isValidWorldEditAuthorizationRevocation
} from '../core/WorldEditAuthorizationEnvelope.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import * as Ed25519 from '../identity/Ed25519.js';

const GRANT_CHANGED_EVENT = 'WorldEditGrantChanged';
const STORAGE_KEY_PREFIX = 'world-membership:';

// 0.2.98 — Shared World Membership & Collaborative Presence.
//
// 0.2.95 answered "who may edit this World" with exactly one identity:
// its owner (plus, transparently, that owner's own authorized devices —
// 0.2.78's composition). 0.2.96/0.2.97 then proved a network of that
// owner's devices could safely converge concurrent edits. 0.2.97 named,
// rather than hid, the gap this class closes: "a genuine multi-owner/
// collaborator model... not one this milestone quietly assumed into
// existence" (docs/Roadmap.md, 0.2.97). This class is the answer — a
// SIGNED, REVOCABLE CAPABILITY an independent identity can hold, never a
// new role, never a second kind of ownership. See core/WorldAccessLevel.js's
// own header on why this stays NONE/READ/EDIT, never grows an
// EDITOR/ADMIN/MODERATOR vocabulary.
//
// Structurally this is application/DeviceAuthorizationPropagationUseCase.js
// again, one layer over, with the identical shape: a gossiped record is
// trusted by its OWN signature alone, never by who relayed it, and
// `_handleIncoming` never reads `meta.connectedPeer` for RELEVANCE — see
// that class's own header for the full argument. The one genuinely new
// question this class answers, that device authorization never needed
// to: is the identity SIGNING this grant actually THIS World's owner?
// Device authorization never asks that — any identity may authorize any
// device to act for ITSELF. A World edit grant is different: Bob must
// never be able to grant himself (or anyone else) access to Alice's
// World — see docs/Roadmap.md, 0.2.98's own security flagship. That
// check is what makes `resolveWorldDocument` a REQUIRED collaborator
// here, unlike DeviceAuthorizationPropagationUseCase's optional
// `knowsIdentity`: every accepted grant/revocation is checked, fresh,
// against the World document's OWN `metadata.authorIdentityId`
// (application/WorldAuthorizationService.js's exact ownership
// comparison, reused here rather than re-implemented) — a record whose
// `grantingIdentityId` does not match is dropped, structurally, on
// every replica, regardless of whether the sender is honest about what
// it claims.
//
// `grantingIdentityId` is deliberately compared RAW, never resolved
// through 0.2.78's device composition the way a VIEWER's identity is
// (application/WorldAuthorizationService.js's own `resolveSocialIdentity`):
// only the World's own canonical `authorIdentityId` — the exact identity
// that created the World — may grant or revoke membership on it. Which
// of Bob's/Alice's own AUTHORIZED DEVICES may exercise a grant once
// issued is a completely separate, already-solved question (0.2.78's
// composition, consumed unmodified by application/WorldAuthorizationService.js
// — see that class's own 0.2.98 update): granting Bob's ROOT identity
// EDIT is what makes BOTH his Desktop and his Tablet editors, with zero
// additional wiring here.
export class WorldMembershipUseCase {
    constructor(storageProvider, identityProvider, {
        peerMessageBus,
        connectedPeerRegistry,
        resolveWorldDocument,
        verifier = new LocalAuthorizationVerifier(),
        protocol = WorldMembershipUseCase.DEFAULT_PROTOCOL
    } = {}) {
        if (!storageProvider) {
            throw new Error('WorldMembershipUseCase: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('WorldMembershipUseCase: identityProvider is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('WorldMembershipUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('WorldMembershipUseCase: a ConnectedPeerRegistry is required');
        }
        if (typeof resolveWorldDocument !== 'function') {
            throw new Error('WorldMembershipUseCase: resolveWorldDocument(worldDocumentId) is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._resolveWorldDocument = resolveWorldDocument;
        this._verifier = verifier;
        this._protocol = protocol;
        this._eventBus = new EventBus();

        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
            }
        });
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
    }

    // Grants `subjectIdentityId` EDIT authority over `worldDocumentId`,
    // signed by the CURRENTLY AUTHENTICATED identity's own raw key —
    // never a device-resolved one; see this class's own header on why
    // only the World's exact `authorIdentityId` may ever issue a valid
    // grant. Throws if this replica is not currently authenticated as
    // that exact owner, or if `subjectIdentityId` is not a well-formed
    // did:key, or names the owner itself (an owner already holds every
    // capability a grant could add). Self-applies (so the granting
    // replica sees the change immediately, without waiting for its own
    // broadcast to loop back — the same discipline
    // DeviceAuthorizationPropagationUseCase#broadcastAuthorization()
    // already established) and broadcasts to every currently
    // AUTHENTICATED peer. Returns the signed grant record.
    grantEdit(worldDocumentId, subjectIdentityId) {
        const record = this._signGrant(worldDocumentId, subjectIdentityId);
        this._applyGrant(record);
        this._broadcast({ kind: WorldMembershipMessageKind.GRANT, record });
        return record;
    }

    // Withdraws a grant already made above. Subject to the exact same
    // "must currently be authenticated as the World's own owner" check
    // grantEdit() applies — a revocation is just as much an owner-only
    // act as the grant it withdraws.
    revokeEdit(worldDocumentId, subjectIdentityId) {
        const grantingIdentityId = this._requireOwnerIdentity(worldDocumentId);
        const record = toWorldEditAuthorizationRevocation({ worldDocumentId, subjectIdentityId, grantingIdentityId });
        const signature = this._identityProvider.signCanonical(getWorldEditAuthorizationRevocationSigningDescriptor(record));
        const signedRecord = { ...record, signature: signature.toJSON() };
        this._applyRevocation(signedRecord);
        this._broadcast({ kind: WorldMembershipMessageKind.REVOCATION, record: signedRecord });
        return signedRecord;
    }

    // The one query application/WorldAuthorizationService.js consults —
    // "does subjectIdentityId currently hold an active EDIT grant for
    // worldDocumentId?" Never itself re-derives ownership; a grant this
    // replica accepted has ALREADY passed the owner check in
    // _handleIncoming()/grantEdit() below.
    hasActiveGrant(worldDocumentId, subjectIdentityId) {
        const authority = this.resolveGrant(worldDocumentId, subjectIdentityId);
        return Boolean(authority && authority.isAuthorized);
    }

    resolveGrant(worldDocumentId, subjectIdentityId) {
        return this._loadAll().find((a) => a.worldDocumentId === worldDocumentId && a.subjectIdentityId === subjectIdentityId) || null;
    }

    // Every membership fact this replica currently holds for one World,
    // most-recently-updated first — the listing a "Manage collaborators"
    // UI would read.
    listMembers(worldDocumentId) {
        return this._loadAll()
            .filter((a) => a.worldDocumentId === worldDocumentId)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    // Returns an unsubscribe function. Fires with the full current
    // listing for `worldDocumentId` on every accepted grant/revocation
    // — self-authored or gossiped — mirroring
    // DeviceAuthorizationPropagationUseCase#onDeviceAuthorityChanged()'s
    // own shape.
    onMembershipChanged(worldDocumentId, callback) {
        const subscription = this._eventBus.subscribe(GRANT_CHANGED_EVENT, ({ worldDocumentId: changedId }) => {
            if (changedId === worldDocumentId) {
                callback(this.listMembers(worldDocumentId));
            }
        });
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeRegistry) {
            this._unsubscribeRegistry();
            this._unsubscribeRegistry = null;
        }
        if (this._unsubscribeBus) {
            this._unsubscribeBus();
            this._unsubscribeBus = null;
        }
        // Deliberately does NOT dispose the injected peerMessageBus or
        // connectedPeerRegistry — both are shared, app-wide collaborators
        // this class never owns.
    }

    _signGrant(worldDocumentId, subjectIdentityId) {
        const grantingIdentityId = this._requireOwnerIdentity(worldDocumentId);
        if (!subjectIdentityId || typeof subjectIdentityId !== 'string' || !Ed25519.didKeyToPublicKey(subjectIdentityId)) {
            throw new Error('WorldMembershipUseCase: subjectIdentityId must be a valid did:key identity');
        }
        if (subjectIdentityId === grantingIdentityId) {
            throw new Error('WorldMembershipUseCase: the World\'s own owner already holds EDIT — a grant is unnecessary');
        }
        const record = toWorldEditAuthorizationGrant({ worldDocumentId, subjectIdentityId, grantingIdentityId });
        const signature = this._identityProvider.signCanonical(getWorldEditAuthorizationGrantSigningDescriptor(record));
        return { ...record, signature: signature.toJSON() };
    }

    // "Am I, right now, this exact World's cryptographic owner?" — the
    // one local gate every mutating method above shares. Deliberately
    // RAW, never device-resolved — see this class's own header.
    _requireOwnerIdentity(worldDocumentId) {
        const document = this._resolveWorldDocument(worldDocumentId);
        if (!document || !document.metadata) {
            throw new Error('WorldMembershipUseCase: unknown World document ' + worldDocumentId);
        }
        const ownerIdentityId = document.metadata.authorIdentityId || null;
        const myIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!ownerIdentityId || !myIdentityId || ownerIdentityId !== myIdentityId) {
            throw new Error('WorldMembershipUseCase: only this World\'s own cryptographic owner may grant or revoke membership');
        }
        return ownerIdentityId;
    }

    _broadcast(message) {
        const authenticatedPeers = this._registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        for (const peer of authenticatedPeers) {
            this._bus.send(peer, this._protocol, message);
        }
        return authenticatedPeers.length;
    }

    // The ingestion boundary for a GOSSIPED grant/revocation. Every
    // incoming message passes every one of these checks, IN ORDER,
    // before it can change anything this replica stores:
    //   1. well-formed shape
    //   2. the record's OWN signature verifies (identity/
    //      LocalAuthorizationVerifier.js — REQUIRED, never tolerated
    //      unsigned)
    //   3. the World is known to this replica at all
    //      (resolveWorldDocument)
    //   4. `grantingIdentityId` equals THAT World's own, exact
    //      `authorIdentityId` — see this class's own header, "Bob must
    //      never be able to grant himself access." A record failing
    //      this is dropped, structurally, with zero trust extended to
    //      whichever peer happened to relay it.
    //   5. freshness — a grant only replaces an existing one when its
    //      `authorizedAt` is strictly newer; a revocation only replaces
    //      an existing one when its `revokedAt` is strictly newer — the
    //      identical rule core/DeviceAuthority.js already applies.
    _handleIncoming(payload) {
        if (!payload || typeof payload !== 'object') {
            return;
        }
        if (payload.kind === WorldMembershipMessageKind.GRANT) {
            this._handleGrant(payload.record);
        } else if (payload.kind === WorldMembershipMessageKind.REVOCATION) {
            this._handleRevocation(payload.record);
        }
    }

    _handleGrant(record) {
        if (!isValidWorldEditAuthorizationGrant(record) || !this._verifier.verifyWorldEditAuthorizationGrant(record).valid) {
            return;
        }
        if (!this._isFromTrueOwner(record)) {
            return;
        }
        this._applyGrant(record);
    }

    _handleRevocation(record) {
        if (!isValidWorldEditAuthorizationRevocation(record) || !this._verifier.verifyWorldEditAuthorizationRevocation(record).valid) {
            return;
        }
        if (!this._isFromTrueOwner(record)) {
            return;
        }
        this._applyRevocation(record);
    }

    _isFromTrueOwner(record) {
        const document = this._resolveWorldDocument(record.worldDocumentId);
        if (!document || !document.metadata) {
            return false;
        }
        return Boolean(document.metadata.authorIdentityId) && document.metadata.authorIdentityId === record.grantingIdentityId;
    }

    // The shared "record this already-trusted grant/revocation" tail
    // both the gossip path (AFTER verification and the true-owner gate
    // above) and this replica's own first-person paths
    // (grantEdit()/revokeEdit()) share — mirroring
    // DeviceAuthorizationPropagationUseCase's own `_applyGrant`/
    // `_applyRevocation` exactly. Never itself checks a signature or
    // ownership; every caller has already decided this record is worth
    // believing before reaching here.
    _applyGrant(record) {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return;
        }
        const all = this._loadAll();
        const existing = all.find((a) => a.worldDocumentId === record.worldDocumentId && a.subjectIdentityId === record.subjectIdentityId) || null;
        if (existing && existing.grant && new Date(existing.grant.authorizedAt).getTime() >= new Date(record.authorizedAt).getTime()) {
            return; // not newer
        }
        const base = existing || new WorldEditAuthority({ worldDocumentId: record.worldDocumentId, subjectIdentityId: record.subjectIdentityId });
        this._saveAll(owner, replaceByPair(all, base.withGrant(record, record.grantingIdentityId)));
        this._publishChange(record.worldDocumentId);
    }

    _applyRevocation(record) {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return;
        }
        const all = this._loadAll();
        const existing = all.find((a) => a.worldDocumentId === record.worldDocumentId && a.subjectIdentityId === record.subjectIdentityId) || null;
        if (existing && existing.revocation && new Date(existing.revocation.revokedAt).getTime() >= new Date(record.revokedAt).getTime()) {
            return; // not newer
        }
        const base = existing || new WorldEditAuthority({ worldDocumentId: record.worldDocumentId, subjectIdentityId: record.subjectIdentityId });
        this._saveAll(owner, replaceByPair(all, base.withRevocation(record)));
        this._publishChange(record.worldDocumentId);
    }

    _loadAll() {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return [];
        }
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner) || [];
        return stored.map((json) => WorldEditAuthority.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, authorities) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, authorities.map((a) => a.toJSON()));
    }

    _publishChange(worldDocumentId) {
        this._eventBus.publish(GRANT_CHANGED_EVENT, { worldDocumentId });
    }

    _currentUsernameOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}

// Namespaced so it can never collide with device-authorization/chat/
// presence/world-sync traffic multiplexed over the same connection —
// see application/DeviceAuthorizationPropagationUseCase.js's own
// DEFAULT_PROTOCOL.
WorldMembershipUseCase.DEFAULT_PROTOCOL = 'forkbuild:world-membership';

const WorldMembershipMessageKind = Object.freeze({
    GRANT: 'GRANT',
    REVOCATION: 'REVOCATION'
});

function replaceByPair(authorities, authority) {
    const withoutExisting = authorities.filter((a) => !(a.worldDocumentId === authority.worldDocumentId && a.subjectIdentityId === authority.subjectIdentityId));
    withoutExisting.push(authority);
    return withoutExisting;
}
