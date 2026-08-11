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
// As of 0.2.2, two schema versions exist:
//   0 (implicit) — pre-0.2.0 documents have no schemaVersion field.
//                  Structure: { world, metadata }. No groups field in
//                  world for pre-0.1.43 documents.
//   1 (current)  — { schemaVersion: 1, world, metadata }. World may
//                  have a groups field.
//
// The migration from 0 → 1 adds the schemaVersion field. Pre-0.1.43
// worlds without a groups field are handled by World.fromJSON() which
// already defaults to an empty groups array.
//
// Adding a future schema 2 means writing one migration function and
// registering it — nothing else changes.
const MIGRATIONS = new Map();

// Register a migration from `fromVersion` to `fromVersion + 1`.
export function registerMigration(fromVersion, migrateFn) {
    MIGRATIONS.set(fromVersion, migrateFn);
}

// Schema 0 → 1: add the schemaVersion field. Pre-0.2.0 documents
// have no schemaVersion; the structure is otherwise identical.
registerMigration(0, (json) => ({
    ...json,
    schemaVersion: 1
}));

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
