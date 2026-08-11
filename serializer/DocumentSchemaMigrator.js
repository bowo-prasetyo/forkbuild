import { DOCUMENT_SCHEMA_VERSION } from '../core/documentSchema.js';
// Schema migration infrastructure for document envelopes.
//
// The cardinal rule: migration happens BEFORE the document enters the
// application domain. Document.fromJSON(), World.fromJSON(), and every
// editing service only ever see current-schema JSON. Old-format
// compatibility code lives here and nowhere else.
//
// Each migration is a pure function: (json) => json, transforming from
// schema N to schema N+1. The migrator walks the chain from the
// document's declared schemaVersion to DOCUMENT_SCHEMA_VERSION.
//
// As of 0.2.0 only schema 1 exists. The infrastructure is in place so
// that adding schema 2 later means writing one migration function and
// registering it — nothing else changes.
const MIGRATIONS = new Map();
// Register a migration from `fromVersion` to `fromVersion + 1`.
// export function registerMigration(fromVersion, migrateFn) {
//     MIGRATIONS.set(fromVersion, migrateFn);
// }
//
// Pre-0.2.0 documents have no schemaVersion field. Treat them as
// schema 1 (the format hasn't changed, we're just making the version
// explicit). No structural transformation needed.
// registerMigration(0, (json) => ({ ...json, schemaVersion: 1 }));
export const DocumentSchemaMigrator = Object.freeze({
    // Returns a new JSON object at DOCUMENT_SCHEMA_VERSION.
    // Never mutates the input.
    migrate(json) {
        if (!json || typeof json !== 'object') {
            return json;
        }
        let current = { ...json };
        let version = current.schemaVersion !== undefined
            ? current.schemaVersion
            : 0; // pre-0.2.0 documents have no schemaVersion
        // Walk the migration chain.
        while (version < DOCUMENT_SCHEMA_VERSION) {
            const migrateFn = MIGRATIONS.get(version);
            if (!migrateFn) {
                // No registered migration — for schema 0 → 1, just add
                // the field. Future gaps are hard errors.
                if (version === 0) {
                    current = { ...current, schemaVersion: 1 };
                    version = 1;
                    continue;
                }
                throw new Error(
                    `DocumentSchemaMigrator: no migration registered from schema ${version}`
                );
            }
            current = migrateFn(current);
            version += 1;
        }
        return current;
    },
    get currentVersion() {
        return DOCUMENT_SCHEMA_VERSION;
    }
});
