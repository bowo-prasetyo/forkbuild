import { CURRENT_SCHEMA_VERSION, BLUEPRINT_KIND } from './BlueprintPackage.js';
import {
    validateBlueprintAttributionPublication,
    BlueprintAttributionPublicationError
} from './BlueprintAttributionPublicationValidator.js';
import {
    validateBlueprintLineageClaimPublication,
    BlueprintLineageClaimPublicationError
} from './BlueprintLineageClaimPublicationValidator.js';
import { validatePublicationAnchor, PublicationAnchorError } from './PublicationAnchorValidator.js';
import {
    validatePublicationSnapshotPlacement,
    PublicationSnapshotPlacementError
} from './PublicationSnapshotPlacementValidator.js';

// 0.4.6 — Blueprint Sharing & Exchange.
//
// Strict, side-effect-free validation of a portable blueprint package,
// deliberately kept separate from application/ImportBlueprintUseCase.js —
// the exact same split identity/IdentityImport.js already draws from
// identity/IdentityRecovery.js one domain over: this module answers ONE
// question, "is this package well-formed?", and never constructs a
// Structure, touches a BrickRegistry beyond asking it `has()`, or persists
// anything. A blueprint file is untrusted input — it may have been edited
// by hand, corrupted in transit, or authored by a different, incompatible
// build of ForkBuild — so malformed input fails HERE, before anything is
// constructed, exactly the same "nothing to roll back because nothing was
// ever attempted" posture IdentityImport's own header describes.
//
// A blueprint is DATA, never executable behavior — see docs/Principles.md,
// "A Blueprint Package Is Portable Data, Never A Live Dependency (0.4.6)."
// Nothing here (or anywhere downstream of it) evaluates a field, runs a
// script, or interprets a package as anything other than the plain
// id/name/category/tags/description/bricks shape core/Structure.js
// already defines.
export class BlueprintPackageError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BlueprintPackageError';
    }
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function validatePosition(position, index) {
    if (!position || typeof position !== 'object') {
        throw new BlueprintPackageError(`BlueprintImport: bricks[${index}].position is missing or not an object`);
    }
    for (const axis of ['x', 'y', 'z']) {
        if (!isFiniteNumber(position[axis])) {
            throw new BlueprintPackageError(`BlueprintImport: bricks[${index}].position.${axis} must be a finite number`);
        }
    }
}

// registry: a BrickRegistry (core/BrickRegistry.js), used only to ask
// `has(definitionId)` — the "supported brick definitions" check named in
// this milestone's own design conversation. Optional so a caller that
// genuinely has no registry available (a future headless validator, a
// server-side check) still gets every other check; passing one is what
// application/ImportBlueprintUseCase.js's own execute() always does.
function validateBrick(brick, index, seenIds, registry) {
    if (!brick || typeof brick !== 'object') {
        throw new BlueprintPackageError(`BlueprintImport: bricks[${index}] is missing or not an object`);
    }
    if (!isNonEmptyString(brick.id)) {
        throw new BlueprintPackageError(`BlueprintImport: bricks[${index}].id is missing or not a string`);
    }
    if (seenIds.has(brick.id)) {
        throw new BlueprintPackageError(`BlueprintImport: duplicate brick id "${brick.id}"`);
    }
    seenIds.add(brick.id);
    if (!isNonEmptyString(brick.definitionId)) {
        throw new BlueprintPackageError(`BlueprintImport: bricks[${index}].definitionId is missing or not a string`);
    }
    if (registry && !registry.has(brick.definitionId)) {
        throw new BlueprintPackageError(`BlueprintImport: bricks[${index}] uses an unsupported brick definition "${brick.definitionId}"`);
    }
    validatePosition(brick.position, index);
    if (!isFiniteNumber(brick.rotation)) {
        throw new BlueprintPackageError(`BlueprintImport: bricks[${index}].rotation must be a finite number`);
    }
}

// Throws BlueprintPackageError describing exactly what's wrong; returns
// nothing on success. Never mutates or normalizes `pkg` — a caller that
// wants a normalized Structure does so afterward, the same "validate,
// THEN construct" order application/ImportBlueprintUseCase.js's own
// header requires.
export function validateBlueprintPackage(pkg, { registry = null } = {}) {
    if (!pkg || typeof pkg !== 'object') {
        throw new BlueprintPackageError('BlueprintImport: package is missing or not an object');
    }
    if (pkg.kind !== BLUEPRINT_KIND) {
        throw new BlueprintPackageError('BlueprintImport: this file is not a ForkBuild blueprint');
    }
    if (pkg.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new BlueprintPackageError(`BlueprintImport: unsupported blueprint schema version ${pkg.schemaVersion}`);
    }

    const structure = pkg.structure;
    if (!structure || typeof structure !== 'object') {
        throw new BlueprintPackageError('BlueprintImport: structure is missing or not an object');
    }
    if (!isNonEmptyString(structure.id)) {
        throw new BlueprintPackageError('BlueprintImport: structure.id is missing or not a string');
    }
    if (!isNonEmptyString(structure.name)) {
        throw new BlueprintPackageError('BlueprintImport: structure.name is missing or not a string');
    }
    if (structure.category !== undefined && typeof structure.category !== 'string') {
        throw new BlueprintPackageError('BlueprintImport: structure.category must be a string');
    }
    if (structure.tags !== undefined) {
        if (!Array.isArray(structure.tags) || structure.tags.some((tag) => typeof tag !== 'string')) {
            throw new BlueprintPackageError('BlueprintImport: structure.tags must be an array of strings');
        }
    }
    if (structure.description !== undefined && typeof structure.description !== 'string') {
        throw new BlueprintPackageError('BlueprintImport: structure.description must be a string');
    }
    if (!Array.isArray(structure.bricks) || structure.bricks.length === 0) {
        throw new BlueprintPackageError('BlueprintImport: structure.bricks must be a non-empty array');
    }

    const seenIds = new Set();
    structure.bricks.forEach((brick, index) => validateBrick(brick, index, seenIds, registry));

    // 0.6.6 — Decentralized Blueprint Exchange. `attributions` is
    // entirely OPTIONAL (see application/BlueprintPackage.js's own
    // header) — a package built before this field existed, or one that
    // simply never had any, has nothing to check here. When present,
    // each entry only ever needs to be a well-formed attribution
    // publication — the exact same STRUCTURAL-only scope this validator
    // already holds for a brick or a structure field; whether an entry
    // actually verifies cryptographically is application/
    // BlueprintAttributionExchange.js#importAttribution()'s own job,
    // never this function's. A malformed entry is re-thrown as a
    // BlueprintPackageError, the ONE error type this validator ever
    // surfaces, rather than leaking BlueprintAttributionPublicationError
    // out of a module whose callers only ever expect the former.
    if (pkg.attributions !== undefined) {
        if (!Array.isArray(pkg.attributions)) {
            throw new BlueprintPackageError('BlueprintImport: attributions must be an array');
        }
        pkg.attributions.forEach((attribution, index) => {
            try {
                validateBlueprintAttributionPublication(attribution);
            } catch (e) {
                if (e instanceof BlueprintAttributionPublicationError) {
                    throw new BlueprintPackageError(`BlueprintImport: attributions[${index}] is malformed — ${e.message}`);
                }
                throw e;
            }
        });
    }

    // 0.6.8 — Blueprint Lineage & Revision Discovery. `lineageClaims` is
    // the identical OPTIONAL, structural-only bundle as `attributions`
    // above, one concept over — see application/BlueprintPackage.js's own
    // header on why the two stay independent, additive fields rather than
    // ever merging into one.
    if (pkg.lineageClaims !== undefined) {
        if (!Array.isArray(pkg.lineageClaims)) {
            throw new BlueprintPackageError('BlueprintImport: lineageClaims must be an array');
        }
        pkg.lineageClaims.forEach((claim, index) => {
            try {
                validateBlueprintLineageClaimPublication(claim);
            } catch (e) {
                if (e instanceof BlueprintLineageClaimPublicationError) {
                    throw new BlueprintPackageError(`BlueprintImport: lineageClaims[${index}] is malformed — ${e.message}`);
                }
                throw e;
            }
        });
    }

    // 0.8.7 — External Evidence Import & Publication Package Integration.
    // `anchors` is the identical OPTIONAL, structural-only bundle as
    // `attributions`/`lineageClaims` above, one evidence layer over — see
    // application/BlueprintPackage.js's own header. Each entry only ever
    // needs to be a well-formed application/PublicationAnchorValidator.js
    // envelope here; whether it is genuinely SIGNED is application/
    // PublicationAnchorExchange.js's own job, one step later, exactly the
    // same split this validator already holds for every other bundled
    // field. A malformed entry is re-thrown as this module's own
    // BlueprintPackageError, never a leaked PublicationAnchorError.
    if (pkg.anchors !== undefined) {
        if (!Array.isArray(pkg.anchors)) {
            throw new BlueprintPackageError('BlueprintImport: anchors must be an array');
        }
        pkg.anchors.forEach((anchor, index) => {
            try {
                validatePublicationAnchor(anchor);
            } catch (e) {
                if (e instanceof PublicationAnchorError) {
                    throw new BlueprintPackageError(`BlueprintImport: anchors[${index}] is malformed — ${e.message}`);
                }
                throw e;
            }
        });
    }

    // 0.8.22 — Snapshot Placement Package Integration. `placements` is
    // the identical OPTIONAL, structural-only bundle as
    // `attributions`/`lineageClaims`/`anchors` above, one locator layer
    // over — see application/BlueprintPackage.js's own header. Each entry
    // only ever needs to be a well-formed application/
    // PublicationSnapshotPlacementValidator.js envelope here; whether it
    // is genuinely SIGNED is application/
    // PublicationSnapshotPlacementExchange.js's own job, one step later,
    // exactly the same split this validator already holds for every
    // other bundled field. A malformed entry is re-thrown as this
    // module's own BlueprintPackageError, never a leaked
    // PublicationSnapshotPlacementError.
    if (pkg.placements !== undefined) {
        if (!Array.isArray(pkg.placements)) {
            throw new BlueprintPackageError('BlueprintImport: placements must be an array');
        }
        pkg.placements.forEach((placement, index) => {
            try {
                validatePublicationSnapshotPlacement(placement);
            } catch (e) {
                if (e instanceof PublicationSnapshotPlacementError) {
                    throw new BlueprintPackageError(`BlueprintImport: placements[${index}] is malformed — ${e.message}`);
                }
                throw e;
            }
        });
    }
}
