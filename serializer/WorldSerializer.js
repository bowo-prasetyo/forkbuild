import { Serializer } from './Serializer.js';
import { ValidationResult } from './ValidationResult.js';
import { World } from '../core/World.js';

// World <-> JSON. Only geometry, identities, and relationships — no
// Document-level metadata (title, author, protocol/engine version); that
// wrapping layer is DocumentSerializer's job.
//
// Delegates to World.toJSON()/fromJSON() rather than reimplementing them.
// The longer-term direction (construction-from-JSON moving fully into
// the serializer, World becoming pure state-representation with no
// knowledge of JSON at all) is worth keeping in mind for when a second
// format actually exists — binary, compressed, a blockchain payload —
// but refactoring World now, with only one format and no second consumer
// yet, would be disruptive for a benefit nothing currently needs.
export class WorldSerializer extends Serializer {
    serialize(world) {
        return world.toJSON();
    }

    // eventBus: optional, passed through so a deserialized World can
    // publish domain events the same as a freshly-built one.
    deserialize(json, eventBus = null) {
        const validation = this.validate(json);
        if (!validation.valid) {
            throw new Error(`WorldSerializer: invalid World JSON — ${validation.errors.join('; ')}`);
        }
        return World.fromJSON(json, eventBus);
    }

    validate(json) {
        if (!json || typeof json !== 'object') {
            return ValidationResult.fail(['World JSON must be an object']);
        }

        const errors = [];
        if (typeof json.id !== 'string') {
            errors.push('World JSON must have a string id');
        }
        if (!Array.isArray(json.buildings)) {
            errors.push('World JSON must have a buildings array');
        }

        return errors.length > 0 ? ValidationResult.fail(errors) : ValidationResult.ok();
    }
}
