import { CausalStamp } from './CausalStamp.js';

// Immutable evidence describing the observation point at which an
// object was accepted (0.2.19).
//
//     timestamp != freshness
//
// A malicious node can simply lie about a timestamp — nothing stops it
// from stamping a replayed manifest with "just now". Freshness
// therefore never carries a wall-clock time. It is derived entirely
// from the authenticated causal/root relationships the protocol
// already establishes: which SpatialIndexRoot this object was
// resolved under, and that root's own CausalStamp (core/CausalStamp.js,
// 0.2.18) — reusing the exact vector-clock machinery replication uses
// to order placement revisions, applied here to order index roots
// signed by the same authority.
export class FreshnessProof {
    constructor({ rootReference = null, rootCausalStamp = null, objectCausalStamp = null } = {}) {
        this._rootReference = rootReference; // hash string, or null if resolved outside any root
        this._rootCausalStamp = rootCausalStamp instanceof CausalStamp
            ? rootCausalStamp
            : (rootCausalStamp ? CausalStamp.fromJSON(rootCausalStamp) : null);
        this._objectCausalStamp = objectCausalStamp instanceof CausalStamp
            ? objectCausalStamp
            : (objectCausalStamp ? CausalStamp.fromJSON(objectCausalStamp) : null);
    }

    get rootReference() { return this._rootReference; }
    get rootCausalStamp() { return this._rootCausalStamp; }
    get objectCausalStamp() { return this._objectCausalStamp; }

    // Is THIS observation at least as causally advanced as `other`?
    // Only meaningful when both sides carry a root causal stamp — with
    // no causal evidence on either side, freshness is INCOMPARABLE, not
    // "equally fresh" (an unproven claim is not evidence of currency).
    isAtLeastAsFreshAs(other) {
        if (!this._rootCausalStamp) {
            return false;
        }
        if (!other || !other.rootCausalStamp) {
            return true; // any evidence beats none
        }
        return this._rootCausalStamp.equals(other.rootCausalStamp)
            || other.rootCausalStamp.happensBefore(this._rootCausalStamp);
    }

    get isComparable() {
        return this._rootCausalStamp !== null;
    }

    toJSON() {
        return {
            rootReference: this._rootReference,
            rootCausalStamp: this._rootCausalStamp ? this._rootCausalStamp.toJSON() : null,
            objectCausalStamp: this._objectCausalStamp ? this._objectCausalStamp.toJSON() : null
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new FreshnessProof(json);
    }
}
