import { Serializer } from './Serializer.js';
import { ValidationResult } from './ValidationResult.js';
import { Document } from '../core/Document.js';
import { DocumentValidator } from './DocumentValidator.js';
import { DocumentSchemaMigrator } from './DocumentSchemaMigrator.js';
import { WorldSerializer } from './WorldSerializer.js';

// Document <-> JSON: metadata + world, wrapping WorldSerializer for the
// world portion.
//
// As of 0.2.2 the deserialization pipeline is:
//   1. Migrate (DocumentSchemaMigrator) — bring the envelope to the
//      current schema BEFORE anything domain-shaped sees it.
//   2. Validate (DocumentValidator) — pure structural check, no UI,
//      no renderer, no session.
//   3. Construct (Document.fromJSON) — enter the domain.
//
// This ordering is the "migration before domain entry" rule. Old-format
// compatibility code never contaminates Brick, Group, World, or any
// editing service.
//
// Canonical serialization guarantee: serialize → deserialize → serialize
// produces byte-identical JSON. Property ordering in toJSON() is
// insertion-ordered (ES2015 guarantee); array ordering follows Map
// insertion order. No sorting is needed.
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
        // 1. Migrate to current schema.
        const migrated = DocumentSchemaMigrator.migrate(json);

        // 2. Validate structure.
        const validation = this.validate(migrated);
        if (!validation.valid) {
            throw new Error(
                `DocumentSerializer: invalid Document JSON — ${validation.errors.join('; ')}`
            );
        }

        // 3. Construct domain object.
        return Document.fromJSON(migrated, eventBus);
    }

    validate(json) {
        // Structural validation via the independent DocumentValidator.
        const structural = DocumentValidator.validate(json);
        if (!structural.valid) {
            return structural;
        }

        // World-level validation.
        const errors = [];
        const warnings = [...structural.warnings];
        const worldValidation = this._worldSerializer.validate(json.world);
        if (!worldValidation.valid) {
            errors.push(...worldValidation.errors);
        }
        warnings.push(...worldValidation.warnings);

        return errors.length > 0
            ? ValidationResult.fail(errors, warnings)
            : ValidationResult.ok(warnings);
    }
}
