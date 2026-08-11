import { ValidationResult } from './ValidationResult.js';
// Pure structural validation of a document JSON envelope. No Vue, no
// Three.js, no EditorSession, no WorldNavigationSession, no browser
// APIs, no CommandHistory. Given only a plain object, answers:
// "Is this structurally a valid ForkBuild document?"
//
// This independence is the whole point: the same validator runs when
// opening a file in the editor, importing from disk, receiving from a
// server, loading a published snapshot, or executing a test suite.
// The validation result is the same regardless of context.
//
// Validation checks structural presence and types. It does NOT check
// domain semantics (whether a definitionId exists in the registry,
// whether positions are physically valid, etc.) — those are runtime
// concerns that require a live registry and world.
export const DocumentValidator = Object.freeze({
    validate(json) {
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
            return ValidationResult.fail(['Document JSON must be an object']);
        }
        const errors = [];
        const warnings = [];
        // --- schemaVersion (required as of 0.2.0) ---
        if (json.schemaVersion === undefined) {
            warnings.push('Document JSON has no schemaVersion (pre-0.2.0 format)');
        } else if (!Number.isInteger(json.schemaVersion) || json.schemaVersion < 1) {
            errors.push(`schemaVersion must be a positive integer, got ${json.schemaVersion}`);
        }
        // --- metadata ---
        if (!json.metadata || typeof json.metadata !== 'object' || Array.isArray(json.metadata)) {
            errors.push('Document JSON must have a metadata object');
        } else {
            if (typeof json.metadata.title !== 'string') {
                warnings.push('metadata.title is missing or not a string');
            }
            if (typeof json.metadata.protocolVersion !== 'string') {
                errors.push('metadata.protocolVersion is required');
            }
            if (typeof json.metadata.engineVersion !== 'string') {
                warnings.push('metadata.engineVersion is missing');
            }
        }
        // --- world ---
        if (!json.world || typeof json.world !== 'object' || Array.isArray(json.world)) {
            errors.push('Document JSON must have a world object');
        } else {
            DocumentValidator._validateWorld(json.world, errors, warnings);
        }
        return errors.length > 0
            ? ValidationResult.fail(errors, warnings)
            : ValidationResult.ok(warnings);
    },
    _validateWorld(world, errors, warnings) {
        if (typeof world.id !== 'string' || world.id.length === 0) {
            errors.push('world.id must be a non-empty string');
        }
        if (!Array.isArray(world.buildings)) {
            errors.push('world.buildings must be an array');
            return;
        }
        for (let i = 0; i < world.buildings.length; i++) {
            DocumentValidator._validateBuilding(world.buildings[i], i, errors, warnings);
        }
        // groups are optional (pre-0.1.43 worlds have none)
        if (world.groups !== undefined) {
            if (!Array.isArray(world.groups)) {
                errors.push('world.groups must be an array when present');
            } else {
                for (let i = 0; i < world.groups.length; i++) {
                    DocumentValidator._validateGroup(world.groups[i], i, errors, warnings);
                }
            }
        }
    },
    _validateBuilding(building, index, errors, warnings) {
        const prefix = `world.buildings[${index}]`;
        if (!building || typeof building !== 'object') {
            errors.push(`${prefix} must be an object`);
            return;
        }
        if (typeof building.id !== 'string' || building.id.length === 0) {
            errors.push(`${prefix}.id must be a non-empty string`);
        }
        if (!Array.isArray(building.bricks)) {
            errors.push(`${prefix}.bricks must be an array`);
            return;
        }
        for (let j = 0; j < building.bricks.length; j++) {
            DocumentValidator._validateBrick(building.bricks[j], `${prefix}.bricks[${j}]`, errors);
        }
    },
    _validateBrick(brick, prefix, errors) {
        if (!brick || typeof brick !== 'object') {
            errors.push(`${prefix} must be an object`);
            return;
        }
        if (typeof brick.id !== 'string' || brick.id.length === 0) {
            errors.push(`${prefix}.id must be a non-empty string`);
        }
        if (typeof brick.definitionId !== 'string' || brick.definitionId.length === 0) {
            errors.push(`${prefix}.definitionId must be a non-empty string`);
        }
        if (!brick.position || typeof brick.position !== 'object') {
            errors.push(`${prefix}.position must be an object`);
        } else if (
            typeof brick.position.x !== 'number'
            || typeof brick.position.y !== 'number'
            || typeof brick.position.z !== 'number'
        ) {
            errors.push(`${prefix}.position must have numeric x, y, z`);
        }
        if (brick.rotation !== undefined && typeof brick.rotation !== 'number') {
            errors.push(`${prefix}.rotation must be a number when present`);
        }
    },
    _validateGroup(group, index, errors, warnings) {
        const prefix = `world.groups[${index}]`;
        if (!group || typeof group !== 'object') {
            errors.push(`${prefix} must be an object`);
            return;
        }
        if (typeof group.id !== 'string' || group.id.length === 0) {
            errors.push(`${prefix}.id must be a non-empty string`);
        }
        if (!Array.isArray(group.brickIds)) {
            errors.push(`${prefix}.brickIds must be an array`);
        } else {
            for (let j = 0; j < group.brickIds.length; j++) {
                if (typeof group.brickIds[j] !== 'string') {
                    errors.push(`${prefix}.brickIds[${j}] must be a string`);
                }
            }
        }
    }
});
