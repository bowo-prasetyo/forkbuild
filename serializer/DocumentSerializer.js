import { Serializer } from './Serializer.js';
import { ValidationResult } from './ValidationResult.js';
import { Document } from '../core/Document.js';
import { PROTOCOL_VERSION } from '../core/protocolVersion.js';
import { WorldSerializer } from './WorldSerializer.js';

// Document <-> JSON: metadata + world, wrapping WorldSerializer for the
// world portion. Validates protocolVersion immediately on deserialize —
// today that means throwing on any mismatch. Migration (transforming an
// older protocol version's JSON forward instead of rejecting it) is
// future work, not needed until a second protocol version actually
// exists to migrate from.
export class DocumentSerializer extends Serializer {
    constructor(worldSerializer = new WorldSerializer()) {
        super();
        this._worldSerializer = worldSerializer;
    }

    serialize(document) {
        return document.toJSON();
    }

    // eventBus: optional, passed through to the wrapped World.
    deserialize(json, eventBus = null) {
        const validation = this.validate(json);
        if (!validation.valid) {
            throw new Error(`DocumentSerializer: invalid Document JSON — ${validation.errors.join('; ')}`);
        }
        return Document.fromJSON(json, eventBus);
    }

    validate(json) {
        if (!json || typeof json !== 'object') {
            return ValidationResult.fail(['Document JSON must be an object']);
        }

        const errors = [];
        const warnings = [];

        if (!json.metadata || typeof json.metadata !== 'object') {
            errors.push('Document JSON must have a metadata object');
        } else if (json.metadata.protocolVersion !== PROTOCOL_VERSION) {
            errors.push(
                `Unsupported protocol version: document is ${json.metadata.protocolVersion}, engine supports ${PROTOCOL_VERSION}`
            );
        }

        const worldValidation = this._worldSerializer.validate(json.world);
        if (!worldValidation.valid) {
            errors.push(...worldValidation.errors);
        }
        warnings.push(...worldValidation.warnings);

        return errors.length > 0 ? ValidationResult.fail(errors, warnings) : ValidationResult.ok(warnings);
    }
}
