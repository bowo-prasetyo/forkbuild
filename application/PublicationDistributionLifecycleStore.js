import { isNonEmptyString } from '../utils/typeGuards.js';

// In-memory store answering one question: what is the most recently
// remembered lifecycle description for this publication? It holds a single
// current value per publication, never a history. It is not a database
// adapter, event log, cache or sync mechanism, and never talks to another
// process, tab, or machine: persistence is layered on top by
// PublicationDistributionLifecyclePersistenceBridge.
//
// KEYED BY `publication.id` — NEVER BY A DISTRIBUTION-DIMENSION IDENTITY
// (material uri, discovery uri, relay, tag or event id): those each describe
// one dimension of a single publication's distribution.
//
// It interprets nothing. set() stores the exact reference it is given
// (REPLACEMENT, NEVER MERGE); a missing entry is null; malformed input is
// ignored, never thrown. Everything is synchronous.
//
// Subscriptions are per publicationId. A successful set() notifies with the
// new value (no equality check), remove() notifies with null, clear() and
// subscribe() notify nobody, and a throwing subscriber never affects the store
// or other subscribers.
//
// Discovery observations are a second, independent map, KEYED BY
// `(publicationId, discoveryProvider)` and additionally by discoveryOrigin
// when one is supplied. Re-observing the same
// key replaces; different providers or origins (for example two Nostr relays)
// coexist. They never notify, and remove()/clear() drop them with the
// publication.

// Key for observations recorded without a discoveryOrigin; a Symbol never
// collides with a real origin string.
const DEFAULT_ORIGIN_KEY = Symbol('PublicationDistributionLifecycleStore.DEFAULT_ORIGIN_KEY');

export class PublicationDistributionLifecycleMemoryStore {
    constructor() {
        this._entries = new Map();
        this._listeners = new Map();
        this._nextListenerId = 0;
        // publicationId -> discoveryProvider -> originKey -> discoverySection.
        this._discoveryObservations = new Map();
    }

    get(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return null;
        }
        if (!this._entries.has(publicationId)) {
            return null;
        }
        return this._entries.get(publicationId);
    }

    set(publicationId, lifecycle) {
        if (!isNonEmptyString(publicationId) || !lifecycle) {
            return;
        }
        this._entries.set(publicationId, lifecycle);
        this._notify(publicationId, lifecycle);
    }

    // Returns whether an entry was removed.
    remove(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return false;
        }
        const removed = this._entries.delete(publicationId);
        this._discoveryObservations.delete(publicationId);
        if (removed) {
            this._notify(publicationId, null);
        }
        return removed;
    }

    clear() {
        this._entries.clear();
        this._discoveryObservations.clear();
    }

    // Returns an idempotent unsubscribe function. Subscribing the same function
    // twice creates two subscriptions.
    subscribe(publicationId, listener) {
        if (!isNonEmptyString(publicationId) || typeof listener !== 'function') {
            return () => {};
        }
        if (!this._listeners.has(publicationId)) {
            this._listeners.set(publicationId, new Map());
        }
        const listenersForId = this._listeners.get(publicationId);
        const id = this._nextListenerId++;
        listenersForId.set(id, listener);
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            listenersForId.delete(id);
            if (listenersForId.size === 0) {
                this._listeners.delete(publicationId);
            }
        };
    }

    recordDiscoveryObservation(publicationId, discoveryProvider, discoverySection, discoveryOrigin) {
        if (!isNonEmptyString(publicationId) || !isNonEmptyString(discoveryProvider) || !discoverySection) {
            return;
        }
        if (!this._discoveryObservations.has(publicationId)) {
            this._discoveryObservations.set(publicationId, new Map());
        }
        const byProvider = this._discoveryObservations.get(publicationId);
        if (!byProvider.has(discoveryProvider)) {
            byProvider.set(discoveryProvider, new Map());
        }
        const originKey = isNonEmptyString(discoveryOrigin) ? discoveryOrigin : DEFAULT_ORIGIN_KEY;
        byProvider.get(discoveryProvider).set(originKey, discoverySection);
    }

    // One entry per (provider, origin), each `{ discoveryProvider, ...section }`;
    // [] when nothing was recorded.
    getDiscoveryObservations(publicationId) {
        if (!isNonEmptyString(publicationId)) {
            return [];
        }
        const byProvider = this._discoveryObservations.get(publicationId);
        if (!byProvider) {
            return [];
        }
        return Array.from(byProvider.entries()).flatMap(([discoveryProvider, byOrigin]) =>
            Array.from(byOrigin.values()).map((section) => ({ discoveryProvider, ...section }))
        );
    }

    _notify(publicationId, lifecycle) {
        const listenersForId = this._listeners.get(publicationId);
        if (!listenersForId) {
            return;
        }
        for (const listener of Array.from(listenersForId.values())) {
            try {
                listener(publicationId, lifecycle);
            } catch (error) {
            }
        }
    }
}
