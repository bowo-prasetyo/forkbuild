import { createId } from './createId.js';

// Describes the causal knowledge possessed by a replica when an
// immutable revision was created.
//
// This is NOT wall-clock time.
//
// A causal stamp answers:
//   "Which revisions had this actor observed when creating this object?"
//
// Vector-clock semantics:
//   A happens-before B  iff every component of A <= B
//                         and at least one component is strictly smaller.
//   Concurrent:         neither A <= B nor B <= A.
export class CausalStamp {
    constructor({ version = 1, clock = {} } = {}) {
        this._version = version;
        this._clock = { ...clock }; // actorId -> integer
    }
    
    get version() { return this._version; }
    get clock() { return { ...this._clock }; }
    
    happensBefore(other) {
        if (!other) return false;
        let strictlySmaller = false;
        const keys = new Set([...Object.keys(this._clock), ...Object.keys(other._clock)]);
        for (const key of keys) {
            const a = this._clock[key] || 0;
            const b = other._clock[key] || 0;
            if (a > b) return false;
            if (a < b) strictlySmaller = true;
        }
        return strictlySmaller;
    }
    
    concurrentWith(other) {
        if (!other) return false;
        return !this.happensBefore(other) && !other.happensBefore(this) && !this.equals(other);
    }
    
    equals(other) {
        if (!other) return false;
        const keys = new Set([...Object.keys(this._clock), ...Object.keys(other._clock)]);
        for (const key of keys) {
            if ((this._clock[key] || 0) !== (other._clock[key] || 0)) return false;
        }
        return true;
    }
    
    merge(other) {
        const merged = { ...this._clock };
        if (other) {
            for (const [key, val] of Object.entries(other._clock)) {
                merged[key] = Math.max(merged[key] || 0, val);
            }
        }
        return new CausalStamp({ version: this._version, clock: merged });
    }
    
    advance(actorId) {
        const next = { ...this._clock };
        next[actorId] = (next[actorId] || 0) + 1;
        return new CausalStamp({ version: this._version, clock: next });
    }
    
    toJSON() {
        return { version: this._version, clock: this._clock };
    }
    
    static fromJSON(json) {
        if (!json) return new CausalStamp();
        return new CausalStamp({ version: json.version || 1, clock: json.clock || {} });
    }
}
