import { EventBus } from '../core/events/EventBus.js';
import { PeerIdentity } from '../peer/PeerIdentity.js';
import { PeerRelationship } from '../core/PeerRelationship.js';

const RELATIONSHIPS_CHANGED_EVENT = 'PeerRelationshipsChanged';
const STORAGE_KEY_PREFIX = 'peer-relationships:';

// 0.2.56 — Persistent Peer Relationships.
//
// "I successfully authenticated Bob once. How do I remember that I
// know Bob without pretending the old connection is still alive?"
// This class is the answer: the persistent-relationship half of the
// split core/PeerRelationship.js's own header draws between a
// peer/PeerIdentity.js (proven, but scoped to one connection), a
// PeerRelationship (durable, but never a live connection), and
// application/ConnectedPeerRegistry.js (live, but never persisted).
//
// Loaded/created/saved through an injected StorageProvider, one list
// per LOCAL owner, the exact same "stable per-owner record, created
// once, reused after" shape application/AvatarProfileUseCase.js
// already established for appearance — see that file's own header.
// Scoped by `identityProvider.currentUser().username` for the same
// reason AvatarProfileUseCase is: it is the one thing every
// identity/IdentityProvider.js implementation is guaranteed to expose,
// not merely identity/LocalIdentityProvider.js's own extended session
// surface.
//
// Every method that requires "who is asking" (getRelationships,
// getRelationship, rememberPeer, updateAlias, forgetPeer) resolves the
// CURRENT local user fresh, every call — never a value captured once
// at construction time — so switching identities on this device
// switches which relationship list is in view, the same way switching
// identities already switches which AvatarProfile is in view.
//
// The one deliberate asymmetry from AvatarProfileUseCase: remembering
// a peer is NEVER automatic. See docs/Principles.md, "Remembering A
// Peer Is A Deliberate Act, Never A Side Effect Of Authentication"
// (0.2.56) — authentication proves possession of a key; it says
// nothing about whether this device's owner wants that key kept
// around. Nothing in this file, in application/PeerSessionManager.js,
// or in application/ConnectToPeerUseCase.js ever calls rememberPeer()
// on this class's behalf.
export class PeerRelationshipUseCase {
    constructor(storageProvider, identityProvider) {
        if (!storageProvider) {
            throw new Error('PeerRelationshipUseCase: storageProvider is required');
        }
        if (!identityProvider) {
            throw new Error('PeerRelationshipUseCase: identityProvider is required');
        }
        this._storageProvider = storageProvider;
        this._identityProvider = identityProvider;
        this._eventBus = new EventBus();
    }

    // Every relationship the current local user has remembered,
    // ordered by alias (falling back to identityId) so a "Known
    // Peers" list renders in a stable, human-friendly order without
    // the caller needing to sort anything itself.
    getRelationships() {
        return this._loadAll().sort((a, b) => (a.alias || a.identityId).localeCompare(b.alias || b.identityId));
    }

    getRelationship(identityId) {
        return this._loadAll().find((r) => r.identityId === identityId) || null;
    }

    isKnown(identityId) {
        return this.getRelationship(identityId) !== null;
    }

    // Alice's "Remember Bob" gesture. `peerIdentity` MUST be a real,
    // verified peer/PeerIdentity.js — see core/PeerRelationship.js's
    // own header for why: only application/ConnectedPeer.js#remoteIdentity,
    // populated exclusively by a completed peer/PeerAuthenticationSession.js
    // handshake, is eligible to become a persistent relationship. An
    // invitation's identityHint, or any other unauthenticated claim,
    // is refused here structurally, not merely by convention.
    //
    // Remembering an identity that is ALREADY known is not an error —
    // it refreshes lastAuthenticatedAt (and the alias, if one was
    // supplied) on the existing record rather than creating a second
    // one. There is never more than one PeerRelationship per
    // identityId per local owner.
    rememberPeer(peerIdentity, { alias } = {}) {
        if (!(peerIdentity instanceof PeerIdentity)) {
            throw new Error('PeerRelationshipUseCase: rememberPeer requires a verified PeerIdentity — an authenticated peer, never an invitation hint');
        }
        const owner = this._requireCurrentUsername();
        const all = this._loadAll();
        const existing = all.find((r) => r.identityId === peerIdentity.identityId);
        const relationship = existing
            ? existing.withLastAuthenticatedAt(new Date()).withAlias(alias !== undefined ? alias : existing.alias)
            : PeerRelationship.fromPeerIdentity(peerIdentity, { alias });
        this._saveAll(owner, replaceById(all, relationship));
        this._publishChange();
        return relationship;
    }

    // Records a fresh, successful authentication against an ALREADY
    // known identity — the "Alice verifies the authenticated identity
    // matches the remembered identity" step of the design doc's
    // flagship scenario. Deliberately a no-op, never an error and
    // never a new relationship, for an identityId this owner hasn't
    // chosen to remember — see this class's own header on why
    // remembering is never automatic.
    noteAuthenticated(peerIdentity) {
        if (!(peerIdentity instanceof PeerIdentity)) {
            throw new Error('PeerRelationshipUseCase: noteAuthenticated requires a verified PeerIdentity');
        }
        const existing = this.getRelationship(peerIdentity.identityId);
        if (!existing) {
            return null;
        }
        return this.rememberPeer(peerIdentity);
    }

    updateAlias(identityId, alias) {
        const owner = this._requireCurrentUsername();
        const all = this._loadAll();
        const existing = all.find((r) => r.identityId === identityId);
        if (!existing) {
            throw new Error('PeerRelationshipUseCase: no known peer with that identity — remember them first');
        }
        const updated = existing.withAlias(alias);
        this._saveAll(owner, replaceById(all, updated));
        this._publishChange();
        return updated;
    }

    // Deletes ONLY this device's local relationship record. Never
    // touches, and has no mechanism to touch, the remembered
    // identity's own avatar, profile, publications, documents, or
    // world placements — see docs/Principles.md, "Forgetting A Peer
    // Deletes A Local Record, Never The Peer" (0.2.56). If that
    // identity happens to be connected right now, forgetting it has no
    // effect on the live connection either: application/
    // ConnectedPeerRegistry.js is a completely separate, untouched
    // piece of state.
    forgetPeer(identityId) {
        const owner = this._requireCurrentUsername();
        const all = this._loadAll();
        if (!all.some((r) => r.identityId === identityId)) {
            throw new Error('PeerRelationshipUseCase: no known peer with that identity');
        }
        this._saveAll(owner, all.filter((r) => r.identityId !== identityId));
        this._publishChange();
    }

    // Returns an unsubscribe function. Fires with the full current
    // relationship list on every remember/alias-update/forget, mirroring
    // application/ConnectedPeerRegistry.js#onChange's own shape so a UI
    // can treat both lists the same way.
    onRelationshipsChanged(callback) {
        const subscription = this._eventBus.subscribe(
            RELATIONSHIPS_CHANGED_EVENT,
            ({ relationships }) => callback(relationships)
        );
        return () => subscription.unsubscribe();
    }

    _loadAll() {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            return [];
        }
        const stored = this._storageProvider.load(STORAGE_KEY_PREFIX + owner) || [];
        return stored.map((json) => PeerRelationship.fromJSON(json)).filter(Boolean);
    }

    _saveAll(owner, relationships) {
        this._storageProvider.save(STORAGE_KEY_PREFIX + owner, relationships.map((r) => r.toJSON()));
    }

    _publishChange() {
        this._eventBus.publish(RELATIONSHIPS_CHANGED_EVENT, { relationships: this.getRelationships() });
    }

    _requireCurrentUsername() {
        const owner = this._currentUsernameOrNull();
        if (!owner) {
            throw new Error('PeerRelationshipUseCase: no user is currently logged in');
        }
        return owner;
    }

    _currentUsernameOrNull() {
        const user = this._identityProvider.currentUser();
        return user ? user.username : null;
    }
}

function replaceById(relationships, relationship) {
    const withoutExisting = relationships.filter((r) => r.identityId !== relationship.identityId);
    withoutExisting.push(relationship);
    return withoutExisting;
}
